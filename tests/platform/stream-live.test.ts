import { describe, expect, it } from "vitest";
import { createLiveClient } from "../../src/platform/stream-live.ts";
import { fakeFetch } from "../helpers/fake-fetch.ts";

const fake = (bodies: unknown[]) => {
	const { calls, fetch } = fakeFetch(...bodies.map((body) => ({ body })));
	return { calls, fetchImpl: fetch };
};

describe("Stream Live client", () => {
	it("creates a signed-only input and returns its WebRTC (WHIP) address", async () => {
		const { calls, fetchImpl } = fake([{ success: true, result: {
			uid: "in1", srt: { url: "srt://live.cloudflare.com:778", streamId: "SID", passphrase: "PW" },
			webRTC: { url: "https://customer-x.cloudflarestream.com/SECRET/webRTC/publish" },
		} }]);
		const input = await createLiveClient({ accountId: "acct", apiToken: "t", fetch: fetchImpl }).createInput("Game", "g14.5-2026");
		expect(input).toEqual({ uid: "in1", whipUrl: "https://customer-x.cloudflarestream.com/SECRET/webRTC/publish" });
		expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/stream/live_inputs");
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ meta: { name: "Game", teamId: "g14.5-2026" }, recording: { mode: "automatic", requireSignedURLs: true } });
		expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer t");
	});
	it("is connected only while a phone is sending", async () => {
		const { fetchImpl } = fake([
			{ success: true, result: { uid: "in1", status: { current: { state: "connected" } } } },
			{ success: true, result: { uid: "in1", status: { current: { state: "disconnected", reason: "client_disconnect" } } } },
			{ success: true, result: { uid: "in1", status: null } },
		]);
		const client = createLiveClient({ accountId: "acct", apiToken: "t", fetch: fetchImpl });
		expect([await client.isConnected("in1"), await client.isConnected("in1"), await client.isConnected("in1")]).toEqual([true, false, false]);
	});
	it("a phone's stream isn't connected once Stream last saw it minutes ago (it keeps saying connected after the phone goes)", async () => {
		const at = (seconds: number) => new Date(Date.parse("2026-11-08T02:30:00Z") + seconds * 1000).toISOString();
		const { fetchImpl } = fake([
			{ success: true, result: { uid: "in1", status: { current: { state: "connected", ingestProtocol: "webrtc", statusLastSeen: at(-10) } } } },
			{ success: true, result: { uid: "in1", status: { current: { state: "connected", ingestProtocol: "webrtc", statusLastSeen: at(-2400) } } } },
		]);
		const client = createLiveClient({ accountId: "acct", apiToken: "t", fetch: fetchImpl, now: () => new Date("2026-11-08T02:30:00Z") });
		expect([await client.isConnected("in1"), await client.isConnected("in1")]).toEqual([true, false]);
	});
	it("a deleted input (404) is gone, not an error: no input, not connected, and switching it off is done", async () => {
		const { fetch } = fakeFetch({ status: 404, body: { success: false, errors: [{ message: "Not Found" }] } });
		const client = createLiveClient({ accountId: "a", apiToken: "t", fetch });
		expect(await client.getInput("x")).toBeNull();
		expect(await client.isConnected("x")).toBe(false);
		await expect(client.disableInput("x")).resolves.toBeUndefined();
		await expect(client.enableInput("x")).rejects.toThrow("(404)");
	});
	it("an external app's address: the input's RTMPS server and stream key; none once the input is gone", async () => {
		const { fetchImpl } = fake([{ success: true, result: { uid: "in1", rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "KEY" }, webRTC: { url: "https://x/whip" } } }]);
		const client = createLiveClient({ accountId: "acct", apiToken: "t", fetch: fetchImpl });
		expect(await client.appAddress("in1")).toEqual({ url: "rtmps://live.cloudflare.com:443/live/", streamKey: "KEY" });
		const gone = fakeFetch({ status: 404, body: { success: false } });
		expect(await createLiveClient({ accountId: "a", apiToken: "t", fetch: gone.fetch }).appAddress("x")).toBeNull();
	});
	it("an external app is connected while it sends: not a browser's stream (WebRTC), and not a status Stream last saw minutes ago", async () => {
		const at = (seconds: number) => new Date(Date.parse("2026-11-06T09:00:00Z") + seconds * 1000).toISOString();
		const { fetchImpl } = fake([
			{ success: true, result: { uid: "in1", status: { current: { state: "connected", ingestProtocol: "rtmp", statusLastSeen: at(-5) } } } },
			{ success: true, result: { uid: "in1", status: { current: { state: "connected", ingestProtocol: "webrtc", statusLastSeen: at(-5) } } } },
			{ success: true, result: { uid: "in1", status: { current: { state: "connected", ingestProtocol: "rtmp", statusLastSeen: at(-600) } } } },
			{ success: true, result: { uid: "in1", status: { current: { state: "disconnected", ingestProtocol: "rtmp" } } } },
			{ success: true, result: { uid: "in1", status: { current: { state: "connected", ingestProtocol: "rtmp" } } } },
		]);
		const client = createLiveClient({ accountId: "acct", apiToken: "t", fetch: fetchImpl, now: () => new Date("2026-11-06T09:00:00Z") });
		const seen = [];
		for (let i = 0; i < 5; i++) seen.push(await client.appConnected("in1"));
		expect(seen).toEqual([true, false, false, false, true]);
	});
	it("lists an input's recordings, newest first as Stream gives them, each live, processing, ready or failed", async () => {
		const { calls, fetchImpl } = fake([{ success: true, result: [
			{ uid: "v2", status: { state: "live-inprogress" }, duration: -1, created: "2026-11-06T09:30:00Z" },
			{ uid: "v1", status: { state: "ready" }, duration: 2400.6, created: "2026-11-06T08:30:00Z" },
			{ uid: "v0", status: { state: "error" }, created: "2026-11-06T08:00:00Z" },
			{ uid: "v9", status: { state: "inprogress" }, duration: 12, created: "2026-11-06T07:00:00Z" },
		] }]);
		const recordings = await createLiveClient({ accountId: "acct", apiToken: "t", fetch: fetchImpl }).recordings("in1");
		expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/stream/live_inputs/in1/videos");
		expect(recordings).toEqual([
			{ uid: "v2", state: "live", durationSeconds: 0, createdAt: "2026-11-06T09:30:00Z" },
			{ uid: "v1", state: "ready", durationSeconds: 2400.6, createdAt: "2026-11-06T08:30:00Z" },
			{ uid: "v0", state: "error", durationSeconds: 0, createdAt: "2026-11-06T08:00:00Z" },
			{ uid: "v9", state: "processing", durationSeconds: 12, createdAt: "2026-11-06T07:00:00Z" },
		]);
	});
	it("keeps a broadcast in one recording through a gap, still recorded and signed-only", async () => {
		const { calls, fetchImpl } = fake([{ success: true, result: { uid: "in1" } }]);
		await createLiveClient({ accountId: "acct", apiToken: "t", fetch: fetchImpl }).keepTogether("in1", 600);
		expect(calls[0]!.init.method).toBe("PUT");
		expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/stream/live_inputs/in1");
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ recording: { mode: "automatic", requireSignedURLs: true, timeoutSeconds: 600 } });
	});
	it("throws with Stream's message on failure", async () => {
		const { fetchImpl } = fake([{ success: false, errors: [{ message: "nope" }] }]);
		await expect(createLiveClient({ accountId: "a", apiToken: "t", fetch: fetchImpl }).getInput("x")).rejects.toThrow("nope");
	});
});
