// Go live from the browser: sends the camera to the game's live input over WebRTC (WHIP) so families can watch,
// and reconnects by itself after the signal drops. The recording (golive-rec.js) doesn't depend on this.
import { timeoutSignal } from "./upload-net.js";

// Stream answers in a second or two; a request that hangs longer is given up, so the retry below can run.
const ANSWER_TIMEOUT_MS = 15_000;

// Live picture only: the recording carries the quality, so keep the live stream light on mobile data.
const LIVE_MAX_BITRATE = 1_500_000;

/**
 * onState("connecting" | "live" | "reconnecting"). Returns { stop(), pause(card), resume(), useMedia(media), sent() }:
 * while paused, families see `card` (a video track) instead of the camera, and no sound. useMedia() swaps in a new
 * camera (Resume camera), from now on and on every new connection.
 */
export function publish(media, url, onState) {
	let pc = null;
	let session = null;
	let stopped = false;
	let wait = 2000;
	let card = null;

	// What each sender sends: the camera and microphone, or the paused card and silence.
	const sending = (kind) => (card ? (kind === "video" ? card : null) : media.getTracks().find((t) => t.kind === kind) ?? null);
	const applyPause = () => pc?.getTransceivers().forEach((t) =>
		t.sender.replaceTrack(sending(t.receiver.track.kind)).catch((err) => console.warn(`live stream: pause: ${err}`)));

	async function connect() {
		if (stopped) return; // End game came during the wait to reconnect
		onState("connecting");
		pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
		const mine = pc;
		for (const track of media.getTracks()) {
			const sendEncodings = track.kind === "video" ? [{ maxBitrate: LIVE_MAX_BITRATE }] : undefined;
			mine.addTransceiver(track, { direction: "sendonly", sendEncodings });
		}
		mine.addEventListener("connectionstatechange", () => {
			if (mine !== pc || stopped) return;
			if (mine.connectionState === "connected") {
				wait = 2000;
				onState("live");
			} else if (mine.connectionState === "failed") {
				retry("connection failed");
			} else if (mine.connectionState === "disconnected") {
				onState("reconnecting");
				// Often comes back by itself (a moment without signal); if not, start a new connection.
				setTimeout(() => { if (mine === pc && mine.connectionState !== "connected") retry("disconnected"); }, 8000);
			}
		});
		if (card) applyPause();
		await mine.setLocalDescription(await mine.createOffer());
		const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: mine.localDescription.sdp, signal: timeoutSignal(ANSWER_TIMEOUT_MS) });
		if (!res.ok) throw new Error(`live stream refused (HTTP ${res.status})`);
		const answer = await res.text();
		const opened = res.headers.get("Location") ? new URL(res.headers.get("Location"), url).toString() : null;
		// End game (or a newer connection) came while Stream was answering: this answer's session is ended, not left open.
		if (mine !== pc || stopped) return end(mine, opened);
		session = opened;
		await mine.setRemoteDescription({ type: "answer", sdp: answer });
	}

	function retry(why) {
		if (stopped) return;
		console.warn(`live stream: ${why}, reconnecting in ${wait / 1000}s`);
		onState("reconnecting");
		end();
		setTimeout(() => connect().catch((err) => retry(String(err))), wait);
		wait = Math.min(wait * 2, 20000);
	}

	// Tell Stream this connection is finished (best effort: it times out by itself anyway). The current one by default.
	function end(connection = pc, at = session) {
		if (at) fetch(at, { method: "DELETE", keepalive: true }).catch((err) => console.warn(`live stream: ${err}`));
		connection?.close();
		if (connection === pc) { pc = null; session = null; }
	}

	connect().catch((err) => retry(String(err)));
	return {
		stop() {
			stopped = true;
			end();
		},
		pause(track) {
			card = track;
			applyPause();
		},
		resume() {
			card = null;
			applyPause();
		},
		useMedia(fresh) {
			media = fresh;
			applyPause();
		},
		/** Packets sent so far on this connection, { audio, video }; null while it isn't connected. */
		async sent() {
			if (!pc || pc.connectionState !== "connected") return null;
			const out = { audio: 0, video: 0 };
			(await pc.getStats()).forEach((s) => { if (s.type === "outbound-rtp" && s.kind in out) out[s.kind] += s.packetsSent ?? 0; });
			return out;
		},
	};
}
