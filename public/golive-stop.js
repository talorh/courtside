// Go live, End game: the live picture ends, the site is told, and the recording either finishes uploading and becomes
// the game video, or (under a minute, the site's call) is thrown away as a test. The camera closes once it's recorded.
import { fillScreen } from "./golive-screen.js";
import { api, withRetries } from "./upload-net.js";

/**
 * `s`: the stream's pieces from golive.js ({ live, rec, phone, pause, media, mix, cam, saving, gameId, startedAt,
 * progress() }).
 */
export async function stopStream(s) {
	s.phone.stop();
	s.pause.end();
	s.live.stop();
	const closeCamera = async () => { s.mix.stop(); s.media.getTracks().forEach((t) => t.stop()); await fillScreen(s.cam, false); s.cam.hidden = true; s.saving.show(); };
	// Under a minute recorded (pauses left out) the site may call it a test (thrown away, the game free again), so wait
	// for its answer.
	const warn = (err) => console.warn(`stop stream: ${err.message ?? err}`);
	// How it ended goes in the site's Log: End game tapped (the only way it ends; the site also takes "camera" from older pages).
	const body = { recordedSeconds: s.rec.recordedSeconds(), cause: "tapped" };
	const answer = body.recordedSeconds < 60 ? await api(`/api/live/${s.gameId}/end`, body).catch((err) => warn(err) ?? null) : null;
	if (!answer) withRetries(() => api(`/api/live/${s.gameId}/end`, body), warn).catch(warn);
	try {
		if (answer?.status === "test") {
			s.rec.cancel();
			await closeCamera();
			return s.saving.test(answer.seconds);
		}
		await s.rec.stop(async () => {
			await closeCamera();
			s.saving.progress(s.progress());
		});
		s.saving.saved();
	} catch (err) {
		s.saving.failed(err);
		throw err;
	}
}

/** End game asks first, so a bump can't end the game early: ending it is final (the site won't take this game again). */
export function endGameButtons({ btn, ask, run, pause, end }) {
	btn("stop").onclick = () => { btn("stop").hidden = true; pause().buttons(false); ask.hidden = false; btn("stopno").focus(); };
	btn("stopno").onclick = () => { ask.hidden = true; btn("stop").hidden = false; pause().buttons(true); };
	btn("stopyes").onclick = () => run(btn("stopyes"), async () => { ask.hidden = btn("stop").hidden = true; await end(); }, () => "");
}
