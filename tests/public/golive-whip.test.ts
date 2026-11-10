import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { publish } from "../../public/golive-whip.js";

/** The browser's WebRTC connection, as far as golive-whip.js uses it. */
class FakePeerConnection {
	static made: FakePeerConnection[] = [];
	connectionState = "new";
	localDescription = { sdp: "offer" };
	closed = false;
	answered = false;
	private listeners: Array<() => void> = [];
	constructor() { FakePeerConnection.made.push(this); }
	added: unknown[] = [];
	addTransceiver(track: unknown) { this.added.push(track); }
	addEventListener(_name: string, fn: () => void) { this.listeners.push(fn); }
	async createOffer() { return { type: "offer", sdp: "offer" }; }
	async setLocalDescription() {}
	async setRemoteDescription() {
		this.answered = true;
		this.connectionState = "connected";
		this.listeners.forEach((fn) => fn());
	}
	getTransceivers() { return []; }
	fire() { this.listeners.forEach((fn) => fn()); }
	close() { this.closed = true; }
}

const media = { getTracks: () => [{ kind: "video" }, { kind: "audio" }] };
const WHIP = "https://stream.test/whip/7";
const SESSION = "https://stream.test/whip/7/session/1";
const realFetch = globalThis.fetch;

beforeEach(() => { FakePeerConnection.made = []; vi.stubGlobal("RTCPeerConnection", FakePeerConnection); });
afterEach(() => { vi.unstubAllGlobals(); globalThis.fetch = realFetch; vi.useRealTimers(); });

describe("the live picture after End game", () => {
	it("End game while it waits to reconnect: no new connection is opened and the page hears nothing more", async () => {
		vi.useFakeTimers();
		const posts: string[] = [];
		globalThis.fetch = (async (url: string) => { posts.push(url); throw new TypeError("Failed to fetch"); }) as typeof fetch;
		const states: string[] = [];
		const live = publish(media, WHIP, (s: string) => states.push(s));
		await vi.advanceTimersByTimeAsync(10); // the first try fails: reconnecting in 2 s
		expect(states).toEqual(["connecting", "reconnecting"]);
		live.stop();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(FakePeerConnection.made).toHaveLength(1);
		expect(posts).toEqual([WHIP]);
		expect(states).toEqual(["connecting", "reconnecting"]);
	});

	it("End game while Stream is still answering: that answer's session is ended, not left open", async () => {
		const calls: Array<{ url: string; method: string }> = [];
		let answer!: (res: Response) => void;
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			calls.push({ url, method: init?.method ?? "GET" });
			if (init?.method === "DELETE") return new Response(null, { status: 200 });
			return new Promise<Response>((resolve) => { answer = resolve; });
		}) as typeof fetch;
		const live = publish(media, WHIP, () => {});
		await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
		expect(calls).toEqual([{ url: WHIP, method: "POST" }]);
		live.stop();
		answer(new Response("answer", { status: 201, headers: { Location: SESSION } }));
		await vi.waitFor(() => expect(calls).toContainEqual({ url: SESSION, method: "DELETE" }));
		const [pc] = FakePeerConnection.made;
		expect(pc.closed).toBe(true);
		expect(pc.answered).toBe(false);
	});
});

describe("the live picture after the camera comes back", () => {
	it("a new camera (Resume camera, after the phone switched the old one off) goes out on the next connection", async () => {
		vi.useFakeTimers();
		globalThis.fetch = (async () => new Response("answer", { status: 201, headers: { Location: SESSION } })) as typeof fetch;
		const live = publish(media, WHIP, () => {});
		await vi.advanceTimersByTimeAsync(10);
		const fresh = { getTracks: () => [{ kind: "video", id: "new-cam" }, { kind: "audio", id: "new-mic" }] };
		live.useMedia(fresh);
		const [first] = FakePeerConnection.made;
		first!.connectionState = "failed";
		first!.fire();
		await vi.advanceTimersByTimeAsync(2500);
		expect(FakePeerConnection.made[1]!.added).toEqual(fresh.getTracks());
		live.stop();
	});
});
