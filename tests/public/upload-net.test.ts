import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { api, apiForm, HttpError, isNetworkTrouble, needsReload, newId, putPart, timeoutSignal, withRetries } from "../../public/upload-net.js";

const realFetch = globalThis.fetch, realTimeout = AbortSignal.timeout;
afterEach(() => { globalThis.fetch = realFetch; AbortSignal.timeout = realTimeout; vi.useRealTimers(); });

/** The test's clock, with AbortSignal.timeout on it (Node's own runs on a real timer the test can't move on). */
const fakeClock = () => {
	vi.useFakeTimers();
	AbortSignal.timeout = (ms: number) => {
		const c = new AbortController();
		setTimeout(() => c.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
		return c.signal;
	};
};

/** A fetch that never answers, like one stalled on a weak signal, until its signal gives up. */
const stalled = () => {
	globalThis.fetch = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
		init.signal?.addEventListener("abort", () => reject(init.signal!.reason));
	})) as typeof fetch;
};

describe("Go live and upload network helpers", () => {
	it("a stalled API call gives up after 30 seconds with a TimeoutError, so it's tried again", async () => {
		fakeClock();
		stalled();
		let settled = false;
		const call = api("/api/uploads/1/part-urls", { partNumbers: [1] }).catch((err: Error) => err).finally(() => { settled = true; });
		await vi.advanceTimersByTimeAsync(29_999);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await call).toMatchObject({ name: "TimeoutError" });
	});
	it("a cancel still comes through as a cancel (never retried), with or without the timeout", async () => {
		stalled();
		const cancel = new AbortController();
		const call = api("/api/uploads", {}, cancel.signal).catch((err: Error) => err);
		cancel.abort();
		expect(await call).toMatchObject({ name: "AbortError" });
	});
	it("a live part gives up when it stalls; a file's part waits as long as it takes", async () => {
		fakeClock();
		stalled();
		const live = putPart("https://r2.test/p1", new Blob(["x"]), undefined, 300_000).catch((err: Error) => err);
		let fileSettled = false;
		putPart("https://r2.test/p2", new Blob(["x"])).finally(() => { fileSettled = true; });
		await vi.advanceTimersByTimeAsync(300_000);
		expect(await live).toMatchObject({ name: "TimeoutError" });
		expect(fileSettled).toBe(false);
	});
	it("a photo is posted as a form and answered like any API call; a stalled one gives up after two minutes", async () => {
		const sent: RequestInit[] = [];
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			sent.push(init);
			return new Response(JSON.stringify({ ok: true, data: { id: 5 } }), { status: 201 });
		}) as typeof fetch;
		const body = new FormData();
		body.set("takenAt", "");
		expect(await apiForm("/api/photos", body)).toEqual({ id: 5 });
		expect(sent[0]).toMatchObject({ method: "POST", body, redirect: "manual" });
		globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, error: { message: "That photo is too big to add (10 MB at most)." } }), { status: 413 })) as typeof fetch;
		expect(await apiForm("/api/photos", body).catch((err: Error) => err)).toMatchObject({ status: 413, message: "That photo is too big to add (10 MB at most)." });
		fakeClock();
		stalled();
		const call = apiForm("/api/photos", body).catch((err: Error) => err);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(await call).toMatchObject({ name: "TimeoutError" });
	});
	it("a photo is tried again only for trouble reaching the site, never when it's refused (403 included)", async () => {
		for (const err of [new TypeError("Failed to fetch"), new DOMException("timed out", "TimeoutError"), new HttpError("busy", 502), new HttpError("slow down", 429)]) {
			expect(isNetworkTrouble(err)).toBe(true);
		}
		for (const err of [new HttpError("not allowed", 403), new HttpError("not a photo", 400), new HttpError("season over", 409), new DOMException("x", "AbortError")]) {
			expect(isNetworkTrouble(err)).toBe(false);
		}
		const hints: string[] = [];
		const refused = withRetries(async () => { throw new HttpError("not allowed", 403); }, (h: string) => hints.push(h), undefined, isNetworkTrouble);
		await expect(refused).rejects.toMatchObject({ status: 403 });
		expect(hints).toEqual([]);
	});
	it("phones too old for a timeout just get the signal they were given; ids are UUIDs either way", () => {
		const signal = new AbortController().signal;
		const timeout = AbortSignal.timeout;
		(AbortSignal as { timeout?: unknown }).timeout = undefined;
		try {
			expect(timeoutSignal(1000, signal)).toBe(signal);
			expect(timeoutSignal(1000)).toBeUndefined();
		} finally {
			AbortSignal.timeout = timeout;
		}
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
		expect(newId()).toMatch(uuid);
		const randomUUID = crypto.randomUUID;
		(crypto as { randomUUID?: unknown }).randomUUID = undefined;
		try {
			for (let i = 0; i < 50; i++) expect(newId()).toMatch(uuid);
		} finally {
			crypto.randomUUID = randomUUID;
		}
	});
});

describe("every write says which team its page was for", () => {
	const realDocument = (globalThis as { document?: unknown }).document;
	afterEach(() => { (globalThis as { document?: unknown }).document = realDocument; });
	const onPage = (team?: string) => { (globalThis as { document?: unknown }).document = { documentElement: { dataset: team ? { team } : {} } }; };
	const capture = () => {
		const sent: RequestInit[] = [];
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			sent.push(init);
			return new Response(JSON.stringify({ ok: true, data: {} }));
		}) as typeof fetch;
		return sent;
	};

	it("api() and apiForm() send X-Courtside-Team from the page's <html data-team>", async () => {
		onPage("g14.5-2026");
		const sent = capture();
		await api("/api/uploads", {});
		await apiForm("/api/photos", new FormData());
		expect(sent.map((init) => new Headers(init.headers).get("X-Courtside-Team"))).toEqual(["g14.5-2026", "g14.5-2026"]);
		expect(new Headers(sent[0]?.headers).get("Content-Type")).toBe("application/json");
	});

	it("sends no team when the page names none, so the site asks for a reload rather than guessing", async () => {
		onPage();
		const sent = capture();
		await api("/api/uploads", {});
		expect(new Headers(sent[0]?.headers).has("X-Courtside-Team")).toBe(false);
	});
});

describe("answers that need the person, not a retry", () => {
	it("knows the site's own code for a refusal, and which of them only a reload fixes", async () => {
		globalThis.fetch = (async () => Response.json({ ok: false, error: { code: "team_changed", message: "Reload this page to carry on." } }, { status: 409 })) as typeof fetch;
		const err = await api("/api/uploads", {}).catch((e: Error) => e);
		expect(err).toMatchObject({ status: 409, code: "team_changed", message: "Reload this page to carry on." });
		expect([needsReload(err), needsReload(new HttpError("Video not found.", 404)), needsReload({ code: "site_updated" }), needsReload(null)]).toEqual([true, false, true, false]);
	});

	it("says what the maintenance page says while it waits for the site to come back, and keeps trying", async () => {
		vi.useFakeTimers();
		const listeners = { addEventListener: () => {}, removeEventListener: () => {} };
		vi.stubGlobal("window", listeners);
		vi.stubGlobal("document", { ...listeners, visibilityState: "visible" });
		vi.stubGlobal("navigator", { onLine: true });
		const hints: string[] = [];
		let tries = 0;
		const step = async () => {
			if (++tries < 3) throw new HttpError("We're upgrading the site. Back by 11:30am.", 503, "maintenance");
			return "done";
		};
		const result = withRetries(step, (h: string) => hints.push(h));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(await result).toBe("done");
		expect(hints[0]).toBe("We're upgrading the site. Back by 11:30am. It carries on by itself after that: keep this page open.");
		vi.unstubAllGlobals();
	});
});
