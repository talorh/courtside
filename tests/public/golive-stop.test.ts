import { afterEach, describe, expect, it, vi } from "vitest";

// Go live's End game (public/golive-stop.js) on a stand-in page: what it tells the site. Minutes of the game still only
// on this phone (a weak signal) make the site wait for them before it saves what reached it by itself.
afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

async function endGame(progress: object | null, recordedSeconds = 3600) {
	const posted: { path: string; body: unknown }[] = [];
	vi.stubGlobal("document", { documentElement: { classList: { toggle() {} } }, fullscreenElement: null });
	vi.stubGlobal("fetch", async (path: string, init: { body: string }) => {
		posted.push({ path, body: JSON.parse(init.body) });
		return Response.json({ ok: true, data: { status: "ended" } });
	});
	const saving = { show() {}, progress() {}, saved: vi.fn(), failed() {}, test() {} };
	const s = {
		phone: { stop() {} }, pause: { end() {} }, live: { stop() {} }, mix: { stop() {} },
		media: { getTracks: () => [] }, cam: { hidden: false, classList: { toggle() {} } }, saving, gameId: 7,
		rec: { recordedSeconds: () => recordedSeconds, stop: async (onRecorded: () => Promise<void>) => onRecorded(), cancel() {} },
		progress: () => progress,
	};
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	const { stopStream } = await import("../../public/golive-stop.js");
	await stopStream(s);
	await vi.waitFor(() => expect(posted).toHaveLength(1));
	expect(saving.saved).toHaveBeenCalledTimes(1);
	return posted[0]!;
}

describe("End game tells the site what's still on this phone", () => {
	it("about 10 minutes recorded but not sent: keptMinutes 10, with how long was recorded and that End game was tapped", async () => {
		expect(await endGame({ recordedBytes: 900_000_000, sentBytes: 700_000_000, waitingBytes: 150_000_000 })).toEqual({
			path: "/api/live/7/end", body: { recordedSeconds: 3600, cause: "tapped", keptMinutes: 10 },
		});
	});
	it("sending keeping up, or nothing reported yet: keptMinutes 0, so the site keeps its half hour", async () => {
		expect((await endGame({ recordedBytes: 900_000_000, sentBytes: 895_000_000, waitingBytes: 5_000_000 })).body).toMatchObject({ keptMinutes: 0 });
		expect((await endGame(null, 30)).body).toEqual({ recordedSeconds: 30, cause: "tapped", keptMinutes: 0 });
	});
});

describe("End game's save failing", () => {
	it("is a problem in the site's Log, sent straight away (the phone's own watch has stopped by then)", async () => {
		const posted: { path: string; body: { events?: Array<{ what: string; p?: boolean }> } }[] = [];
		vi.stubGlobal("document", { documentElement: { classList: { toggle() {} } }, fullscreenElement: null });
		vi.stubGlobal("fetch", async (path: string, init: { body: string }) => {
			posted.push({ path, body: JSON.parse(init.body) });
			return Response.json({ ok: true, data: { status: "ended" } });
		});
		const s = {
			phone: { stop() {} }, pause: { end() {} }, live: { stop() {} }, mix: { stop() {} },
			media: { getTracks: () => [] }, cam: { hidden: false, classList: { toggle() {} } }, gameId: 7,
			saving: { show() {}, progress() {}, saved() {}, failed() {}, test() {} },
			rec: { recordedSeconds: () => 3600, stop: async () => { throw new Error("the recording's last part didn't upload"); }, cancel() {} },
			progress: () => null,
		};
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { stopStream } = await import("../../public/golive-stop.js");
		await expect(stopStream(s)).rejects.toThrow("last part");
		await vi.waitFor(() => expect(posted.find((p) => p.path === "/api/live/7/events")).toBeTruthy());
		expect(posted.find((p) => p.path === "/api/live/7/events")!.body.events).toEqual([{ s: 0, what: "End game's save failed: the recording's last part didn't upload", p: true }]);
	});
});
