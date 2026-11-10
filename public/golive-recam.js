// Go live: the camera goes away mid-game (the phone locks, a call comes, another app takes the camera). Nothing ends.
// While the page is hidden, or the camera's off, families see the Game break card and the recording holds. A camera
// that comes back by itself carries on by itself; one the phone switched off for good comes back with Resume camera, a
// tap on every phone (an iPhone starts a camera only from one), in the same video.
import { startCamera } from "./golive-screen.js";
import { cameraProblem } from "./golive-status.js";

// Not a blocked camera: most often a call, or the app that took it, still has it.
const NOT_YET = "The camera didn't start: a call or another app may still have it. Tap Resume camera again.";

/**
 * `media()` is the camera in use, `swap(media)` puts a new one everywhere it's used (golive.js); `pause` is the stream's
 * golive-pause.js. Returns { lost(), gone(), end() }: lost() when the phone switched the camera off for good
 * (golive-watch.js); gone() is false, true, or why Resume camera didn't work (golive-status.js).
 */
export function cameraComeback({ btn, run, show, note, media, swap, pause }) {
	let gone = false, ended = false;
	const recam = btn("recam");
	// Hidden, or the camera's off (ended, or muted: Android's way) holds; a camera back on, or a new one, lets go.
	const away = () => {
		if (ended) return;
		const [video] = media().getVideoTracks();
		pause.hold("away", document.visibilityState === "hidden" || video.readyState === "ended" || video.muted);
	};
	const follow = () => { const [video] = media().getVideoTracks(); for (const type of ["mute", "unmute"]) video.addEventListener(type, away); };
	document.addEventListener("visibilitychange", away);
	follow();

	recam.onclick = () => run(recam, async () => {
		const fresh = await startCamera().catch((err) => {
			gone = err.name === "NotAllowedError" ? cameraProblem(err) : NOT_YET;
			throw err;
		});
		// End game came while the camera was asked for: it isn't wanted any more.
		if (ended) return fresh.getTracks().forEach((t) => t.stop());
		swap(fresh);
		follow();
		gone = false;
		recam.hidden = true;
		pause.hold("camera", false);
		away();
		note("camera back");
	}, (err) => {
		note(`camera back failed: ${err.name}: ${err.message}`, true);
		if (gone === true) gone = `Resume camera didn't work: ${err.message}. Tap it again.`;
		show();
		return "";
	});
	return {
		lost() {
			if (ended) return;
			// Let go of it: a camera Android only muted still holds the device, and a new one couldn't start.
			media().getTracks().forEach((t) => t.stop());
			gone = true;
			pause.hold("camera", true);
			recam.hidden = false;
		},
		gone: () => gone,
		/** End game: no Resume camera from here. */
		end() {
			ended = true;
			gone = false;
			recam.hidden = true;
			document.removeEventListener("visibilitychange", away);
		},
	};
}
