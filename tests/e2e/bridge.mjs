// The far end of the live picture in the browser tests, standing in for Stream: a Chromium page that answers a phone's
// WHIP offer and counts what arrives, or sends its fake camera to a families' player that asks over WHEP.

// Chromium's fake camera and microphone, no permission prompts, and real addresses in its ICE candidates (by default
// they're hidden behind .local names, which nothing in the test container can look up).
export const CHROMIUM_FAKE_MEDIA = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-features=WebRtcHideLocalIpsWithMdns"];

export async function startBridge(chromium, pageUrl) {
	const browser = await chromium.launch({ args: CHROMIUM_FAKE_MEDIA });
	const context = await browser.newContext({ permissions: ["camera", "microphone"] });
	const page = await context.newPage();
	await page.goto(pageUrl);
	await page.evaluate(() => {
		window.peers = [];
		// The answer goes back once this end's own candidates are in. The phone sends none in its offer (Stream doesn't
		// need them): this end learns the phone's address from its connection checks, as Stream does.
		window.finish = async (pc) => {
			await pc.setLocalDescription(await pc.createAnswer());
			await new Promise((resolve) => {
				if (pc.iceGatheringState === "complete") return resolve();
				pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") resolve(); });
				setTimeout(resolve, 3000);
			});
			return pc.localDescription.sdp;
		};
	});
	return {
		/** WHIP: answers the phone's offer and keeps receiving. */
		answerWhip: (offer) => page.evaluate(async (sdp) => {
			const pc = new RTCPeerConnection();
			window.peers.push(pc);
			await pc.setRemoteDescription({ type: "offer", sdp });
			return window.finish(pc);
		}, offer),
		/** WHEP: answers a player's offer with this page's fake camera and microphone. */
		answerWhep: (offer) => page.evaluate(async (sdp) => {
			window.camera ??= await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
			const pc = new RTCPeerConnection();
			window.peers.push(pc);
			await pc.setRemoteDescription({ type: "offer", sdp });
			for (const t of pc.getTransceivers()) {
				t.direction = "sendonly";
				// While the filming phone is gone, a player still gets its connection: nothing is sent on it.
				await t.sender.replaceTrack(window.phoneGone ? null : window.camera.getTracks().find((track) => track.kind === t.receiver.track.kind) ?? null);
			}
			return window.finish(pc);
		}, offer),
		/** What has arrived over every WHIP connection so far: packets of sound and picture, and frames decoded. */
		received: () => page.evaluate(async () => {
			const total = { audio: 0, video: 0, frames: 0, connected: 0 };
			for (const pc of window.peers) {
				if (pc.connectionState === "connected") total.connected++;
				(await pc.getStats()).forEach((s) => {
					if (s.type !== "inbound-rtp") return;
					total[s.kind] += s.packetsReceived ?? 0;
					if (s.kind === "video") total.frames += s.framesDecoded ?? 0;
				});
			}
			return total;
		}),
		/** The filming phone goes (its page closed, say), as Stream shows it to the players: every connection stays up
		 * with nothing more sent on it, and a player that asks again gets a connection with nothing on it either. */
		phoneGone: () => page.evaluate(async () => {
			window.phoneGone = true;
			for (const pc of window.peers) for (const sender of pc.getSenders()) await sender.replaceTrack(null);
		}),
		/** The filming phone is back over a new connection of its own: the players' connections from before stay as they
		 * were, with nothing on them, and one that asks again gets the picture. */
		phoneBack: () => page.evaluate(() => { window.phoneGone = false; }),
		/** A new test: every connection from the last one is closed. */
		reset: () => page.evaluate(() => { for (const pc of window.peers) pc.close(); window.peers = []; window.phoneGone = false; }),
		close: () => browser.close(),
	};
}
