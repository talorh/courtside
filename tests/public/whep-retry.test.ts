import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
	vi.useRealTimers();
});

/** A browser's live connection, as far as the live player uses it. This one says "closed" as close() runs, as some
 * browsers have. */
class FakeConnection extends EventTarget {
	static made: FakeConnection[] = [];
	connectionState = "new";
	localDescription = { sdp: "offer" };
	constructor() { super(); FakeConnection.made.push(this); }
	addTransceiver() {}
	async createOffer() { return { type: "offer", sdp: "offer" }; }
	async setLocalDescription() {}
	async setRemoteDescription() {}
	async getStats() { return new Map(); }
	set(state: string) { this.connectionState = state; this.dispatchEvent(new Event("connectionstatechange")); }
	close() { if (this.connectionState !== "closed") this.set("closed"); }
}

/** The game page with a live player, Stream answering every offer. */
async function livePlayer() {
	vi.useFakeTimers();
	FakeConnection.made = [];
	const video = { muted: true, paused: false, readyState: 0, dataset: { whep: "https://stream.test/webRTC/play" }, srcObject: null,
		play: async () => {}, addEventListener: () => {}, parentElement: { addEventListener: () => {} } };
	const on = () => {};
	vi.stubGlobal("document", { querySelector: (sel: string) => (sel === "video[data-whep]" ? video : null), addEventListener: on, hidden: false });
	vi.stubGlobal("location", { pathname: "/games/7", reload: () => {} });
	vi.stubGlobal("addEventListener", on);
	vi.stubGlobal("RTCPeerConnection", FakeConnection);
	vi.stubGlobal("MediaStream", class { addTrack() {} });
	vi.stubGlobal("fetch", async () => new Response("answer", { status: 201 }));
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	await import("../../public/whep.js");
	await vi.advanceTimersByTimeAsync(0);
}

describe("the live player starting over", () => {
	it("a dropped connection is tried again once, though closing it says it's closed", async () => {
		await livePlayer();
		expect(FakeConnection.made).toHaveLength(1);
		FakeConnection.made[0]!.set("failed");
		await vi.advanceTimersByTimeAsync(3_000);
		expect(FakeConnection.made).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(FakeConnection.made).toHaveLength(2);
	});
});
