// Go live's streaming pipeline, once the site has said where to stream and record: the mix (golive-mixer.js), the live
// picture (golive-whip.js), the recording (golive-rec.js), Pause, Resume camera and the phone's watch. Shared by Go live
// and by Carry on streaming after the page closed (the same pieces, into a later segment of the same recording).
import { mixer } from "./golive-mixer.js";
import { cameraComeback } from "./golive-recam.js";
import { record } from "./golive-rec.js";
import { pauseControls } from "./golive-pause.js";
import { watchPhone } from "./golive-watch.js";
import { publish } from "./golive-whip.js";
import { askName } from "./team.js";

const NOT_SAVING = "⚠ The recording isn't saving. Tap Reload and carry on.";

/**
 * The stream's pieces and state, read by golive.js for its status line and End game. `p`: { gameId, mime, cam, video,
 * btn, run, show, saving, say, media(), swap(fresh), sound() }. start(answer, minutesBefore) begins streaming into
 * answer's recording ({ videoId, partSize, whipUrl, segment }); minutesBefore is what earlier segments recorded, so the
 * status line's count carries on from where it was; `sending` is the earlier segment's kept parts still going up, which
 * End game waits for.
 */
export function streaming(p) {
	const s = { live: null, rec: null, pause: null, phone: null, mix: null, recam: null, startedAt: 0, minutesBefore: 0, liveState: "connecting", progress: null, trouble: "" };
	// The live picture carries on, but something's wrong: say so on the camera screen for as long as it's streaming.
	const troubled = (text) => { s.trouble = ` · ${text}`; s.phone?.note(text, true); p.show(); };
	// What the recording is made of, for the logs: the recorder, the sound mix, and the picture and sound it records.
	const tracks = () => s.mix.stream.getTracks().map((t) => `${t.kind} ${t.readyState}${t.muted ? " muted" : ""}`).join(", ");
	const health = () => `recorder ${s.rec.state()}; sound ${p.sound().sound.state}; ${tracks()}`;
	s.start = (answer, minutesBefore = 0, sending = null) => {
		s.startedAt = Date.now();
		s.minutesBefore = minutesBefore;
		const media = p.media();
		const { sound } = p.sound();
		s.mix = mixer(p.video, media, p.sound());
		sound.addEventListener("statechange", () => s.phone?.note(`sound ${sound.state}`));
		s.live = publish(media, answer.whipUrl, (state) => { s.liveState = state; s.phone?.note(`live ${state}`, state === "reconnecting"); p.show(); });
		s.rec = record(s.mix.stream, { videoId: answer.videoId, partSize: answer.partSize, segment: answer.segment, minutesBefore, mime: p.mime, gameId: p.gameId }, {
			onProgress: (progress) => { s.progress = progress; if (s.live) p.show(); else p.saving.progress(progress); },
			hint: (text) => { console.warn(`upload: ${text}`); s.phone?.note(`upload: ${text}`); },
			onFatal: (err) => troubled(`The recording has stopped saving: ${err.status === 401 ? "signed out" : err.message}`),
			onStopped: () => { troubled("⚠ The recording has stopped. Tap Reload and carry on, or End game to save what was recorded."); p.btn("reload").hidden = false; },
		});
		if (sending) s.rec.before(sending);
		s.pause = pauseControls({ btn: p.btn, cam: p.cam, live: s.live, rec: s.rec, show: p.show });
		const swap = (fresh) => { p.swap(fresh); [s.mix, s.live, s.phone].forEach((x) => x.useMedia(fresh)); };
		s.recam = cameraComeback({ btn: p.btn, run: p.run, show: p.show, pause: s.pause, swap, media: p.media, note: (what, problem) => s.phone?.note(what, problem) });
		s.phone = watchPhone(media, p.gameId, {
			live: () => s.live, rec: s.rec, paused: () => Boolean(s.pause?.carded()), health, onCameraLost: () => s.recam.lost(),
			onSoundLost: () => { if (!s.trouble) troubled(`⚠ No sound: the phone's microphone has stopped. Keep filming, and tell ${askName()} after the game.`); },
			onRecordingQuiet: () => { troubled(NOT_SAVING); p.btn("reload").hidden = false; },
			// It carried on by itself: the warning goes, unless something else has gone wrong since.
			onRecordingBack: () => { if (s.trouble === ` · ${NOT_SAVING}`) { s.trouble = ""; p.btn("reload").hidden = true; p.show(); } },
		});
		p.btn("live").hidden = true;
		p.btn("stop").hidden = false;
		p.say(""); // the advice from before Go live no longer applies
		p.show();
	};
	return s;
}
