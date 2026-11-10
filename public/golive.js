// Go live: camera preview, then Go live streams to families and records on the phone, uploading as it goes
// (golive-stream.js has the pipeline). End game, then "Yes, end game", ends it and saves the video. A page that closed
// mid-game offers Carry on streaming (golive-recover.js), into the next segment of the same recording.
import { soundForTaps } from "./golive-mixer.js";
import { recordingInTheWay } from "./golive-recover.js";
import { checkBrowser, phoneKind, pickMime } from "./golive-check.js";
import { buttonRunner } from "./golive-run.js";
import { savingPanel } from "./golive-saving.js";
import { endGameButtons, stopStream } from "./golive-stop.js";
import { keepAwake } from "./awake.js";
import { fillScreen, startCamera, whenCameraLost } from "./golive-screen.js";
import { CAMERA_STOPPED, cameraProblem, screenTip, STARTING, statusText, STOPPING } from "./golive-status.js";
import { streaming } from "./golive-stream.js";
import { api, newId } from "./upload-net.js";
import { inWebApp } from "./webapp.js";

const card = document.querySelector(".weblive");
if (card) setup(card);
function setup(card) {
	const gameId = card.dataset.game;
	const $ = (sel) => card.querySelector(sel);
	const cam = $("[data-cam]"), video = $("video"), status = $("[data-status]"), msg = $("[data-msg]"), ask = $("[data-stopask]");
	const saving = savingPanel(card);
	const btn = (act) => $(`[data-act="${act}"]`);
	// While the camera fills the screen only it shows, so messages go in its status line too.
	const say = (text) => { msg.textContent = text; if (cam.classList.contains("full") && text) status.textContent = text; };
	const run = buttonRunner(say);
	const mime = pickMime(), attempt = newId(); // asking again after a lost answer gets the same recording back
	if (!checkBrowser($("[data-browser]"), Boolean(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection && window.AudioContext && HTMLCanvasElement.prototype.captureStream && mime))) return;

	let media = null, sound = null, awake = null, previewLost = null;
	let waiting = false; // Go live was tapped while upright, and goes live once it turns
	const leaving = (e) => { e.preventDefault(); e.returnValue = ""; };
	// What the phone saw at Go live goes to the site's logs, so a Go live that didn't start can be explained.
	const tell = (what, problem = false) => api(`/api/live/${gameId}/events`, { events: [{ s: 0, what: what.slice(0, 160), ...(problem ? { p: true } : {}) }] }).catch((err) => console.warn(`live log: ${err.message ?? err}`));
	const upright = () => video.videoHeight >= video.videoWidth;
	// iPhone starts sound only from a tap: made in the tap itself, before anything is awaited.
	const soundNow = () => (sound ??= soundForTaps());
	const s = streaming({ gameId, mime, cam, video, btn, run, saving, say, show: () => show(), media: () => media, swap: (fresh) => { media = video.srcObject = fresh; }, sound: soundNow });
	const show = () => void (status.textContent = statusText({
		live: Boolean(s.live), tall: upright(), phone: phoneKind, waiting, paused: s.pause?.pausedFor() ?? null, cameraGone: s.recam?.gone() ?? false,
		minutes: s.minutesBefore + Math.floor((Date.now() - s.startedAt) / 60000), connected: s.liveState === "live", trouble: s.trouble, progress: s.progress,
	}));
	// A phone that won't keep its screen on is told how; the tip goes once it does.
	const screenKept = (held) => (held ? msg.textContent === screenTip(phoneKind) && say("") : !s.live && say(screenTip(phoneKind)));
	// The camera went before Go live (the phone locked, or another app took it): Go live would stream nothing.
	const cameraStopped = () => {
		media.getTracks().forEach((t) => t.stop());
		cam.hidden = btn("live").hidden = true;
		btn("camera").hidden = false; waiting = false;
		say(CAMERA_STOPPED);
		tell("camera stopped before go live", true);
	};
	const streamingFrom = (answer, minutesBefore = 0, sending = null) => {
		s.start(answer, minutesBefore, sending);
		window.addEventListener("beforeunload", leaving);
		setInterval(() => { if (s.live) show(); }, 30000);
	};
	// The page closed mid-game (golive-recover.js): once the site has given the next segment, the camera starts (the phone
	// may ask for it again) and the red button becomes Carry on, a tap that makes the sound and starts streaming into
	// that segment as Go live would: the sound made after the camera's prompt, never interrupted by it.
	let pending = null; // the segment to stream into on the next Go live tap
	const carryOn = { mime, say, async ready(answer, minutesBefore, sending) {
		pending = { answer, minutesBefore, sending };
		awake ??= keepAwake(screenKept);
		media = await startCamera().catch((err) => { tell(`carry on camera failed: ${err.name}: ${err.message}`, true); throw new Error(cameraProblem(err)); });
		video.srcObject = media; video.onresize = turned;
		previewLost = whenCameraLost(media, cameraStopped);
		cam.hidden = false;
		btn("live").lastChild.textContent = "Carry on";
		btn("live").hidden = false;
		say("Tap Carry on to stream again. The game carries on in the same video.");
		show();
	} };
	// End game is wired before the recover card's return: a carried-on stream ends the same way.
	endGameButtons({ btn, ask, run, pause: () => s.pause, end: async () => {
		if (!s.live) return;
		s.recam.end();
		status.textContent = STOPPING;
		const stream = { live: s.live, rec: s.rec, phone: s.phone, pause: s.pause, media, mix: s.mix, cam, saving, gameId, startedAt: s.startedAt, progress: () => s.progress };
		s.live = null; // from here the recording's progress goes to the Saving panel
		try {
			await stopStream(stream);
		} finally {
			awake?.release();
			window.removeEventListener("beforeunload", leaving);
		}
	} });
	btn("camera").hidden = recordingInTheWay(card, { btn, say, carryOn }); // a recording to carry on or save: no Start camera
	// A recording that has stopped saving (the page came back from being put away): a fresh page finds it and carries on.
	btn("reload").onclick = () => location.reload();

	btn("camera").onclick = () => run(btn("camera"), async () => {
		// The screen stays on from this tap (setting up takes minutes; iPhone grants it only straight after a tap, awake.js).
		awake ??= keepAwake(screenKept);
		media = await startCamera();
		video.srcObject = media; video.onresize = turned;
		previewLost = whenCameraLost(media, cameraStopped);
		cam.hidden = false;
		btn("camera").hidden = true; btn("live").hidden = false;
		show();
	}, (err) => {
		tell(`camera failed: ${err.name}: ${err.message}`, true);
		return cameraProblem(err);
	});

	// The picture turned (so did the phone): Go live waiting for the phone to go sideways goes live now, by itself.
	function turned() {
		show();
		if (!waiting || upright()) return;
		waiting = false;
		tell(`going live by itself: ${video.videoWidth}x${video.videoHeight} ${screen.orientation?.type ?? "?"}`);
		run(btn("live"), goLive);
	}

	btn("live").onclick = () => run(btn("live"), async () => {
		soundNow();
		tell(`go live tap ${video.videoWidth}x${video.videoHeight} ${screen.orientation?.type ?? "?"} app=${inWebApp()} fs=${typeof cam.requestFullscreen}`);
		// Upright (held so, or Portrait Orientation Lock): one tap is enough. It waits
		// for the phone to turn sideways and goes live then (turned); a second tap goes live as it is.
		if (upright() && !waiting) return void (waiting = true, show());
		waiting = false;
		await goLive();
	});

	async function goLive() {
		previewLost?.(); // the stream's own watch (golive-watch.js) takes over once it starts
		status.textContent = STARTING;
		await fillScreen(cam, true);
		if (pending) return streamingFrom(pending.answer, pending.minutesBefore, pending.sending);
		const start = await api(`/api/live/${gameId}/browser`, { mimeType: mime, attempt }).catch(async (err) => {
			tell(`go live refused: ${err.status ?? err.name}: ${err.message}`, true);
			await fillScreen(cam, false);
			previewLost = whenCameraLost(media, cameraStopped);
			show();
			throw err;
		});
		streamingFrom(start);
	}

}
