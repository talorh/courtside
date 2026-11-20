import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { api, apiForm, HttpError, isNetworkTrouble, keepTrying, needsReload, newId, putPart, withRetries } from "../../public/upload-net.js";

const realFetch = globalThis.fetch, realTimeout = AbortSignal.timeout, realAny = AbortSignal.any;
afterEach(() => { globalThis.fetch = realFetch; AbortSignal.timeout = realTimeout; AbortSignal.any = realAny; vi.useRealTimers(); });

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
		// The site's own 429 (with its code) is a limit reached, not the zone slowing things down: trying again can't help.
		for (const err of [new HttpError("not allowed", 403), new HttpError("not a photo", 400), new HttpError("season over", 409), new DOMException("x", "AbortError"),
			new HttpError("You've added 500 photos in the last 24 hours", 429, "photo_limit")]) {
			expect(isNetworkTrouble(err)).toBe(false);
		}
		const hints: string[] = [];
		const refused = withRetries(async () => { throw new HttpError("not allowed", 403); }, (h: string) => hints.push(h), undefined, isNetworkTrouble);
		await expect(refused).rejects.toMatchObject({ status: 403 });
		expect(hints).toEqual([]);
	});
	it("an upload's API call, which can be cancelled, still gives up after 30 seconds on a phone without AbortSignal.any", async () => {
		fakeClock();
		(AbortSignal as { any?: unknown }).any = undefined;
		stalled();
		let settled = false;
		const call = api("/api/uploads/1/part-urls", { partNumbers: [1] }, new AbortController().signal).catch((err: Error) => err).finally(() => { settled = true; });
		await vi.advanceTimersByTimeAsync(29_999);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await call).toMatchObject({ name: "TimeoutError" });
	});
	it("ids are UUIDs, on phones too old for crypto.randomUUID too", () => {
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

	it("a page from in front of the site (a 524 from Cloudflare, not JSON) says the site didn't answer, not that an upload failed", async () => {
		globalThis.fetch = (async () => new Response("<html>A timeout occurred</html>", { status: 524, headers: { "Content-Type": "text/html" } })) as typeof fetch;
		const err = await api("/api/live/7/save", {}).catch((e: Error) => e);
		expect(err).toMatchObject({ status: 524, code: null, message: "The site didn't answer (HTTP 524). Try again." });
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

describe("how long an upload keeps trying", () => {
	const onPage = (onLine: boolean) => {
		vi.useFakeTimers();
		const listeners = { addEventListener: () => {}, removeEventListener: () => {} };
		vi.stubGlobal("window", listeners);
		vi.stubGlobal("document", { ...listeners, visibilityState: "visible" });
		const net = { onLine };
		vi.stubGlobal("navigator", net);
		return net;
	};
	afterEach(() => vi.unstubAllGlobals());
	/** Fails `times` times with a dropped connection, then works. */
	const failing = (times: number) => {
		let tries = 0;
		return { step: async () => { if (++tries <= times) throw new TypeError("Load failed"); return "done"; }, tries: () => tries };
	};

	it("gives up on a signal that says it's online but never gets anything through, after 40 tries", async () => {
		onPage(true);
		const { step, tries } = failing(Infinity);
		const result = withRetries(step, () => {}).catch((err: Error) => err);
		await vi.advanceTimersByTimeAsync(60 * 60_000);
		expect(await result).toMatchObject({ name: "TypeError" });
		expect(tries()).toBe(40);
	});
	it("an hour offline spends none of its tries: back online, it still has all 40", async () => {
		const net = onPage(false);
		const { step, tries } = failing(Infinity);
		let settled = false;
		const result = withRetries(step, () => {}).catch((err: Error) => err).finally(() => { settled = true; });
		await vi.advanceTimersByTimeAsync(60 * 60_000);
		expect(settled).toBe(false);
		expect(tries()).toBeGreaterThan(40);
		const offline = tries();
		net.onLine = true;
		await vi.advanceTimersByTimeAsync(60 * 60_000);
		expect(await result).toMatchObject({ name: "TypeError" });
		expect(tries() - offline).toBe(40);
	});
	it("starts its tries again whenever something got through, so a weak signal that keeps creeping along never gives up", async () => {
		onPage(true);
		const { step, tries } = failing(100);
		let sent = 0;
		const result = withRetries(async () => { sent++; return step(); }, () => {}, undefined, undefined, () => sent).catch((err: Error) => err);
		await vi.advanceTimersByTimeAsync(60 * 60_000);
		expect(await result).toBe("done");
		expect(tries()).toBe(101);
	});
});

describe("a 403: storage's run-out link is tried again, the site's own refusal isn't", () => {
	const onPage = () => {
		vi.useFakeTimers();
		const listeners = { addEventListener: () => {}, removeEventListener: () => {} };
		vi.stubGlobal("window", listeners);
		vi.stubGlobal("document", { ...listeners, visibilityState: "visible" });
		vi.stubGlobal("navigator", { onLine: true });
	};
	afterEach(() => vi.unstubAllGlobals());
	const answers = (...replies: Array<() => Response>) => {
		let n = 0;
		globalThis.fetch = (async () => replies[Math.min(n++, replies.length - 1)]!()) as typeof fetch;
		return () => n;
	};
	const notYours = () => Response.json({ ok: false, error: { code: "forbidden", message: "This upload belongs to someone else." } }, { status: 403 });
	// Someone not on a team gets the not-on-a-team page, a web page, even at an /api/ address.
	const notOnTeam = () => new Response("<html>You're not on a team's list</html>", { status: 403, headers: { "Content-Type": "text/html" } });
	const linkRunOut = () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
	const stored = () => new Response(null, { status: 200, headers: { ETag: '"e1"' } });

	it("an upload's API call answered 403 by the site, in JSON or as a page, is refused at once, not tried again", async () => {
		onPage();
		for (const refusal of [notYours, notOnTeam]) {
			const tries = answers(refusal);
			const hints: string[] = [];
			const err = await withRetries(() => api("/api/uploads/41/complete", {}), (h: string) => hints.push(h)).catch((e: Error) => e);
			expect(err).toMatchObject({ status: 403 });
			expect([tries(), hints]).toEqual([1, []]);
		}
	});

	it("a part storage turns down with 403 (its signed link ran out) is sent again", async () => {
		onPage();
		const tries = answers(linkRunOut, stored);
		const etag = withRetries(() => putPart("https://r2.test/p1", new Blob(["x"])), () => {});
		await vi.advanceTimersByTimeAsync(10_000);
		expect([await etag, tries()]).toEqual(['"e1"', 2]);
	});

	it("Go live keeps sending a part through storage's 403s, but stops at the site's own 403 rather than asking for ever", async () => {
		onPage();
		const tries = answers(linkRunOut, linkRunOut, stored);
		const etag = keepTrying(() => putPart("https://r2.test/p1", new Blob(["x"]), undefined, 300_000), () => {});
		await vi.advanceTimersByTimeAsync(30_000);
		expect([await etag, tries()]).toEqual(['"e1"', 3]);
		for (const refusal of [notYours, notOnTeam]) {
			const asked = answers(refusal);
			const refused = keepTrying(() => api("/api/uploads/41/part-urls", { partNumbers: [1] }), () => {}).catch((e: Error) => e);
			await vi.advanceTimersByTimeAsync(60_000);
			expect(await refused).toMatchObject({ status: 403 });
			expect(asked()).toBe(1);
		}
	});

	it("a 403 from Cloudflare's own security in front of the site (cf-mitigated) is tried again, not taken as the site's refusal", async () => {
		onPage();
		const challenged = () => new Response("<html>Just a moment…</html>", { status: 403, headers: { "cf-mitigated": "challenge" } });
		const tries = answers(challenged, () => Response.json({ ok: true, data: { urls: { 1: "https://r2.test/p1" } } }));
		const asked = keepTrying(() => api("/api/uploads/41/part-urls", { partNumbers: [1] }), () => {});
		await vi.advanceTimersByTimeAsync(30_000);
		expect([await asked, tries()]).toEqual([{ urls: { 1: "https://r2.test/p1" } }, 2]);
	});
});

