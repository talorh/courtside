// Go live: watches the phone while it streams, and sends what it sees to the site's logs (/api/live/:id/events) so a
// failed stream can be explained afterwards. iPhone switches the camera off for good when the phone is locked or
// another app takes it, and it can stop the microphone while the camera carries on (no sound live, and the recording
// stops saving as it goes).
import { whenCameraLost } from "./golive-screen.js";
import { api } from "./upload-net.js";

/**
 * onCameraLost() if the camera stops (once for each camera: useMedia() watches a new one); onSoundLost() once if the live
 * picture is going out with no sound; onRecordingQuiet() if the recording has handed nothing over for 20 seconds while
 * live and not paused (the recorder never started, or stalled), and onRecordingBack() if it then carries on by itself.
 * live() is the live connection (golive-whip.js), rec the recording (golive-rec.js), paused() true while families see
 * the Game break card, health() what the recorder and the sound are doing, for a quiet check's line. Returns
 * { note(what, problem), useMedia(media), stop() }.
 */
export function watchPhone(media, gameId, { live, rec, paused, health, onCameraLost, onSoundLost, onRecordingQuiet, onRecordingBack }) {
	const started = Date.now();
	const waiting = [];
	const flush = () => {
		if (waiting.length) api(`/api/live/${gameId}/events`, { events: waiting.splice(0, 40) }).catch((err) => console.warn(`live log: ${err.message ?? err}`));
	};
	// The page hiding (a lock) or closing may be the last chance: the notes go now, as a request that outlives the page.
	const flushLeaving = () => {
		while (waiting.length) {
			api(`/api/live/${gameId}/events`, { events: waiting.splice(0, 40) }, undefined, { keepalive: true }).catch((err) => console.warn(`live log: ${err.message ?? err}`));
		}
	};
	// `problem`: something went wrong (the camera or sound lost, the connection dropped): a problem in the admin Log too.
	const note = (what, problem = false) => {
		waiting.push({ s: Math.round((Date.now() - started) / 1000), what: String(what).slice(0, 160), ...(problem ? { p: true } : {}) });
		if (waiting.length >= 40) flush();
	};

	let done = false;
	let soundGone = false, recordingQuiet = false;
	let stopWatchingCamera = () => {};
	const useMedia = (media) => {
		stopWatchingCamera();
		const [video] = media.getVideoTracks();
		const [audio] = media.getAudioTracks();
		for (const [name, track] of [["camera", video], ["microphone", audio]]) {
			for (const type of ["mute", "unmute", "ended"]) track.addEventListener(type, () => note(`${name} ${type}`));
		}
		stopWatchingCamera = whenCameraLost(media, () => {
			if (done) return;
			note("camera stopped", true);
			onCameraLost();
		});
	};
	useMedia(media);
	const pageShown = () => {
		note(`page ${document.visibilityState}`);
		if (document.visibilityState === "hidden") flushLeaving();
	};
	document.addEventListener("visibilitychange", pageShown);
	const pageClosing = () => { note("page closing"); flushLeaving(); };
	addEventListener("pagehide", pageClosing);

	// Every 10 seconds: picture going out on the live connection but no sound means the microphone has stopped.
	let last = null;
	let checks = 0;
	const check = setInterval(async () => {
		const sent = await live()?.sent().catch(() => null);
		const quiet = Math.round(rec.quietFor() / 1000);
		const silent = Boolean(sent && last && !paused() && sent.video > last.video && sent.audio === last.audio);
		if (++checks % 6 === 0 || silent || quiet >= 10) {
			const more = paused() ? "; paused" : quiet >= 10 && health ? `; ${health()}` : "";
			note(`check: ${sent ? `${sent.audio} sound, ${sent.video} picture packets sent` : "live not connected"}; recording quiet ${quiet}s${more}`);
		}
		last = sent;
		if (silent && !soundGone && !done) {
			soundGone = true;
			note("sound stopped", true);
			onSoundLost();
		}
		if (quiet >= 20 && live() && !paused() && !recordingQuiet && !done) {
			recordingQuiet = true;
			note("recording quiet: nothing recorded for 20 seconds", true);
			onRecordingQuiet?.();
		} else if (recordingQuiet && quiet < 10 && !done) {
			recordingQuiet = false;
			note("recording back");
			onRecordingBack?.();
		}
	}, 10_000);
	const sending = setInterval(flush, 30_000);
	note(`started: ${navigator.userAgent}`);

	return {
		note,
		useMedia,
		stop() {
			done = true;
			clearInterval(check);
			clearInterval(sending);
			stopWatchingCamera();
			document.removeEventListener("visibilitychange", pageShown);
			removeEventListener("pagehide", pageClosing);
			note("stopped");
			flush();
		},
	};
}
