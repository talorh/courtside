// Game page: plays a live stream sent from the filming phone's browser, over WebRTC (WHEP), about a second behind.
// Keeps trying while the stream hasn't started, and starts over when the picture stops arriving or the connection
// drops, so it needs no taps. An external app's stream plays in Stream's own player; for both, the page moves on by
// itself once the stream is over.
import { timeoutSignal } from "./upload-net.js";
import { reloadWhenOver, waitCard } from "./whep-wait.js";

// Stream answers in a second or two; a request that hangs longer is given up and tried again.
const ANSWER_TIMEOUT_MS = 15_000;
const video = document.querySelector("video[data-whep]");
const over = document.querySelector("[data-live-player]") ? reloadWhenOver() : () => {};
if (video) {
	video.muted = false;
	watch(video, video.dataset.whep, over);
	soundButton(video);
}

// Plays with the sound on where the browser allows it. Where it doesn't (phones won't start a video with sound until
// the page has been tapped), it plays silent and the first tap anywhere turns the sound on; the button says so.
function soundButton(video) {
	const button = document.querySelector("[data-unmute]");
	const soundOn = () => {
		if (!video.muted) return;
		video.muted = false;
		video.play().catch((err) => console.warn(`live player: play with sound refused: ${err}`));
	};
	video.addEventListener("volumechange", () => { if (!video.muted && button && !button.hidden) button.parentElement.remove(); });
	video.addEventListener("refused-sound", () => { if (button) button.hidden = false; }, { once: true });
	document.addEventListener("click", soundOn);
}

/** Starts the picture: with sound if the browser lets it, otherwise silent (and the sound button shows). */
async function play(video) {
	try {
		await video.play();
	} catch (err) {
		if (err.name !== "NotAllowedError" || video.muted) return console.warn(`live player: ${err}`);
		video.muted = true;
		video.dispatchEvent(new Event("refused-sound"));
		await video.play().catch((e) => console.warn(`live player: ${e}`));
	}
}

async function connect(video, url) {
	const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
	const stream = new MediaStream();
	try {
		pc.addTransceiver("video", { direction: "recvonly" });
		pc.addTransceiver("audio", { direction: "recvonly" });
		pc.ontrack = (e) => stream.addTrack(e.track);
		await pc.setLocalDescription(await pc.createOffer());
		const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: pc.localDescription.sdp, signal: timeoutSignal(ANSWER_TIMEOUT_MS) });
		if (!res.ok) throw new Error(`live player: HTTP ${res.status}`);
		await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
	} catch (err) {
		pc.close(); // a failed try leaves nothing open
		throw err;
	}
	video.srcObject = stream;
	play(video);
	return pc;
}

/** How much of the picture has arrived on this connection: the frames decoded so far, or the video's clock where the
 * browser doesn't count them. */
async function arrived(pc, video) {
	let frames = null;
	try {
		(await pc.getStats()).forEach((s) => { if (s.type === "inbound-rtp" && s.kind === "video" && s.framesDecoded !== undefined) frames = (frames ?? 0) + s.framesDecoded; });
	} catch (err) {
		console.warn(`live player: ${err}`);
	}
	return frames ?? video.currentTime;
}

// The page's signed token has at least 5 hours left when it's served; a page open longer than this reloads before
// trying again, so it gets a fresh one (and a stream that's long over shows as saved).
const RELOAD_AFTER_MS = 4 * 3600 * 1000;
const opened = Date.now();

function watch(video, url, over) {
	let pc = null;
	let wait = 3000;
	const retry = (why) => {
		if (Date.now() - opened > RELOAD_AFTER_MS) return location.reload();
		console.warn(`live player: ${why}, trying again in ${wait / 1000}s`);
		pc?.close();
		pc = null;
		setTimeout(attempt, wait);
		wait = Math.min(wait * 2, 8000);
	};
	async function attempt() {
		try {
			pc = await connect(video, url);
		} catch (err) {
			return retry(String(err));
		}
		const mine = pc;
		mine.addEventListener("connectionstatechange", () => {
			if (mine === pc && ["failed", "closed"].includes(mine.connectionState)) retry(`connection ${mine.connectionState}`);
		});
		// Connected but no picture (not live yet, or paused): start over until frames arrive.
		setTimeout(() => {
			if (mine !== pc) return;
			if (video.readyState < 2) retry("no picture yet");
			else wait = 3000;
		}, 12000);
	}
	// The filming phone went (its page closed, or it lost signal): this connection can stay up with nothing arriving on
	// it, and stays that way when the phone comes back over a new connection of its own. So once a picture that was
	// arriving has stopped for 10 seconds, start over. It's counted on the connection, because the video's clock can
	// run on with no picture; and not while the page is out of sight or the video paused, when nothing may be decoded.
	let last = { on: null, count: 0, at: 0 };
	setInterval(async () => {
		const mine = pc;
		if (!mine) return;
		const count = await arrived(mine, video);
		if (mine !== pc) return;
		if (last.on !== mine || count > last.count || document.hidden || video.paused) last = { on: mine, count, at: Date.now() };
		else if (count > 0 && Date.now() - last.at >= 10_000) retry("picture stopped");
	}, 5000);
	// Meanwhile a frozen picture asks whether the game has ended, and says the stream will resume if it hasn't (whep-wait.js).
	const card = document.querySelector("[data-live-wait]");
	if (card) {
		let lastFrameAt = 0;
		const seen = () => { lastFrameAt = Date.now(); if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(seen); };
		if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(seen); else video.addEventListener("timeupdate", seen);
		waitCard(card, () => (lastFrameAt ? Date.now() - lastFrameAt : 0), over);
	}
	attempt();
}
