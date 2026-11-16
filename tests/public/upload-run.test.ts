import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { failedWords, upload } from "../../public/upload-run.js";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { HttpError } from "../../public/upload-net.js";

const real = { fetch: globalThis.fetch, timeout: AbortSignal.timeout };
afterEach(() => {
	globalThis.fetch = real.fetch;
	AbortSignal.timeout = real.timeout;
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

/** The page around the uploader, on the test's clock: no storage, a visible page, nothing to wait for. */
function page() {
	vi.useFakeTimers();
	AbortSignal.timeout = (ms: number) => {
		const c = new AbortController();
		setTimeout(() => c.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
		return c.signal;
	};
	const listeners = { addEventListener: () => {}, removeEventListener: () => {} };
	vi.stubGlobal("window", listeners);
	vi.stubGlobal("document", { ...listeners, visibilityState: "visible" });
}

/** The site and storage: piece 1 fails once straight away (a dropped signal); every piece takes 3 seconds. */
function network() {
	const puts = new Map<number, number>();
	let dropped = false;
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		if (init.method === "PUT") {
			const n = Number(/p(\d+)$/.exec(url)![1]);
			puts.set(n, (puts.get(n) ?? 0) + 1);
			if (n === 1 && !dropped) { dropped = true; throw new TypeError("Failed to fetch"); }
			await new Promise((resolve) => setTimeout(resolve, 3000));
			return new Response(null, { headers: { ETag: `"e${n}"` } });
		}
		const body = JSON.parse(String(init.body));
		if (url === "/api/uploads") return Response.json({ ok: true, data: { videoId: 1, partSize: 1, totalParts: 10 } });
		if (url.endsWith("/part-urls")) {
			return Response.json({ ok: true, data: { urls: Object.fromEntries(body.partNumbers.map((n: number) => [n, `https://r2.test/p${n}`])) } });
		}
		return Response.json({ ok: true, data: { status: "processing", parts: body.parts.length } });
	}) as typeof fetch;
	return puts;
}

describe("saved progress for an upload the site no longer has, found at Complete", () => {
	// Every piece was sent before the page closed, so nothing is asked of the site until Complete: the video was deleted
	// since (404), or it finished and then failed (409). Saved progress like that used to answer "Video not found." every
	// try (and "This upload has already finished." once, before the page forgot it).
	for (const [status, message] of [[404, "Video not found."], [409, "This upload has already finished."]] as const) {
		it(`starts afresh (${status}): a new upload, every piece sent again, and the saved progress forgotten`, async () => {
			page();
			const key = "courtside-upload:7:game.mov:10";
			const etags = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, `"old${i + 1}"`]));
			const stored = new Map([[key, JSON.stringify({ videoId: 1, partSize: 1, totalParts: 10, etags })]]);
			vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
			const calls: string[] = [];
			globalThis.fetch = (async (url: string, init: RequestInit) => {
				calls.push(`${init.method} ${url}`);
				if (init.method === "PUT") return new Response(null, { headers: { ETag: '"new"' } });
				const body = JSON.parse(String(init.body));
				if (url === "/api/uploads/1/complete") return Response.json({ ok: false, error: { message } }, { status });
				if (url === "/api/uploads") return Response.json({ ok: true, data: { videoId: 2, partSize: 1, totalParts: 10 } }, { status: 201 });
				if (url === "/api/uploads/2/part-urls") {
					return Response.json({ ok: true, data: { urls: Object.fromEntries(body.partNumbers.map((n: number) => [n, `https://r2.test/p${n}`])) } });
				}
				if (url === "/api/uploads/2/complete") return Response.json({ ok: true, data: { status: "processing" } });
				return Response.json({ ok: false, error: { message: `unexpected ${url}` } }, { status: 400 });
			}) as typeof fetch;
			const done = upload(new File([new Uint8Array(10)], "game.mov", { type: "video/quicktime" }), 7, undefined, { hint: () => {}, show: () => {} });
			await vi.advanceTimersByTimeAsync(10_000);
			expect(await done).toEqual({ status: "processing" });
			expect(calls.filter((c) => c.startsWith("PUT"))).toHaveLength(10);
			expect(calls.filter((c) => c.endsWith("/complete"))).toEqual(["POST /api/uploads/1/complete", "POST /api/uploads/2/complete"]);
			expect(stored.has(key)).toBe(false);
		});
	}
});

describe("a site that asks for a reload (multi-team guard)", () => {
	for (const code of ["site_updated", "team_changed"]) {
		it(`stops at once (${code}), keeping the saved progress for after the reload, and never starts a new upload`, async () => {
			page();
			const key = "courtside-upload:7:game.mov:10";
			const saved = JSON.stringify({ videoId: 1, partSize: 1, totalParts: 10, etags: { 1: '"e1"' } });
			const stored = new Map([[key, saved]]);
			vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
			const calls: string[] = [];
			const message = "The site has been updated. Reload the page to carry on.";
			globalThis.fetch = (async (url: string, init: RequestInit) => {
				calls.push(`${init.method} ${url}`);
				return Response.json({ ok: false, error: { code, message } }, { status: 409 });
			}) as typeof fetch;
			const done = upload(new File([new Uint8Array(10)], "game.mov", { type: "video/quicktime" }), 7, undefined, { hint: () => {}, show: () => {} }).catch((err: Error) => err);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(await done).toMatchObject({ message, status: 409, code });
			expect(calls).toEqual(["POST /api/uploads/1/part-urls"]);
			expect(stored.get(key)).toBe(saved);
		});
	}
});

describe("uploading a file through a dropped signal", () => {
	it("tries again without sending pieces twice: only those still on their way when it tried again go twice", async () => {
		page();
		const puts = network();
		const done = upload(new File([new Uint8Array(10)], "game.mov", { type: "video/quicktime" }), 7, undefined, { hint: () => {}, show: () => {} });
		await vi.advanceTimersByTimeAsync(60_000);
		expect(await done).toEqual({ status: "processing", parts: 10 });
		expect(Object.fromEntries(puts)).toEqual({ 1: 2, 2: 2, 3: 2, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 });
	});
});

describe("an upload on a signal that keeps dropping", () => {
	it("carries on for as long as pieces keep getting through, however many tries that takes", async () => {
		page();
		// 60 pieces, and every other piece sent is dropped: far more failed tries than an upload has, but each one sends a piece.
		let sent = 0;
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			if (init.method === "PUT") {
				if (++sent % 2) throw new TypeError("Load failed");
				return new Response(null, { headers: { ETag: `"e${sent}"` } });
			}
			const body = JSON.parse(String(init.body));
			if (url === "/api/uploads") return Response.json({ ok: true, data: { videoId: 1, partSize: 1, totalParts: 60 } });
			if (url.endsWith("/part-urls")) {
				return Response.json({ ok: true, data: { urls: Object.fromEntries(body.partNumbers.map((n: number) => [n, `https://r2.test/p${n}`])) } });
			}
			return Response.json({ ok: true, data: { status: "processing", parts: body.parts.length } });
		}) as typeof fetch;
		const done = upload(new File([new Uint8Array(60)], "game.mov", { type: "video/quicktime" }), 7, undefined, { hint: () => {}, show: () => {} }).catch((err: Error) => err);
		await vi.advanceTimersByTimeAsync(60 * 60_000);
		expect(await done).toEqual({ status: "processing", parts: 60 });
	});
	it("when it does give up, says so in plain words: what's sent is kept, and choosing the same video carries on", () => {
		const gaveUp = "The connection kept dropping, so the upload has stopped. What's been sent is kept: choose the same video again to carry on from there.";
		for (const err of [new TypeError("Load failed"), new DOMException("The operation timed out.", "TimeoutError"), new HttpError("The site didn't answer (HTTP 524). Try again.", 524), new HttpError("storage returned HTTP 403", 403)]) {
			expect(failedWords(err)).toBe(gaveUp);
		}
		// The site's own refusal says what it says.
		expect(failedWords(new HttpError("This game already has its video. Ask the team manager if it needs replacing.", 409))).toBe("This game already has its video. Ask the team manager if it needs replacing.");
		// Maintenance answers 503 with when it'll be back: that, not the connection words.
		expect(failedWords(new HttpError("The site is down for maintenance until 9pm.", 503, "maintenance"))).toBe("The site is down for maintenance until 9pm.");
		expect(failedWords(new HttpError("You've been signed out. Reload the page and sign in, then choose the same video", 401))).toBe("You've been signed out. Reload the page and sign in, then choose the same video.");
	});
});
