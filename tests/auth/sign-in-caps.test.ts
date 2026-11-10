import { afterEach, describe, expect, it, vi } from "vitest";
import { heldEmails, purgeSignInRecords, releaseHold } from "../../src/auth/sign-in-codes-repository.ts";
import { LIMITS } from "../../src/auth/sign-in-limits.ts";
import { MAX_TRIES, requestCode, verifyCode } from "../../src/auth/sign-in-service.ts";
import { handleRequest } from "../../src/app/handle-request.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { SIGN_IN_MESSAGES } from "../../src/features/signin/views/signin-page.ts";
import { MANAGER } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";

// An address's day: 20 codes and 15 wrong codes, from any number of IP addresses, then a day's wait unless its team
// manager lets it in. A hold ending doesn't start its counts afresh, so code after code can't be guessed.

afterEach(() => vi.restoreAllMocks());

const sentCode = (deps: TestDeps) => /code is (\d{3}) (\d{3})/.exec(deps.email.sent.at(-1)?.subject ?? "")!.slice(1).join("");
const wrongFor = (code: string) => (code === "000000" ? "111111" : "000000");

function clocked() {
	let now = new Date("2026-10-31T09:00:00.000Z");
	const deps = createTestDeps();
	deps.now = () => now;
	vi.spyOn(console, "log").mockImplementation(() => {});
	return { deps, later: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

/** Every one of a code's tries wrong, each from its own IP address (so no IP address's limit is what stops it). */
async function useUpCode(deps: TestDeps, n: number) {
	await requestCode(deps, MANAGER, `10.0.${n}.1`);
	const wrong = wrongFor(sentCode(deps));
	for (let i = 0; i < MAX_TRIES; i++) expect(await verifyCode(deps, MANAGER, wrong, `10.${n}.${i}.9`, "x")).toBe("wrong");
}

describe("an address's day", () => {
	it("gets 20 codes a day however they're spaced, then waits a day; its team manager can let it in sooner", async () => {
		const { deps, later } = clocked();
		for (let i = 0; i < LIMITS.emailPerDay; i++) {
			expect(await requestCode(deps, MANAGER, `10.0.0.${i}`)).toBe("sent");
			later(7 * 60_000);
		}
		expect(await requestCode(deps, MANAGER, "10.9.9.9")).toBe("limited");
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([{ email: MANAGER, until: "2026-11-01T11:20:00.000Z" }]);
		later(12 * 3_600_000);
		expect(await requestCode(deps, MANAGER, "10.9.9.9")).toBe("limited");
		expect(deps.email.sent).toHaveLength(LIMITS.emailPerDay);
		await releaseHold(deps.db, MANAGER, deps.now().toISOString());
		later(1000);
		expect(await requestCode(deps, MANAGER, "10.9.9.9")).toBe("sent");
	});
	it("gets 15 wrong codes a day from any number of IP addresses, then no more codes are sent and none is taken for a day", async () => {
		const { deps, later } = clocked();
		for (let n = 0; n < LIMITS.wrongPerEmailDay / MAX_TRIES; n++) await useUpCode(deps, n);
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([{ email: MANAGER, until: "2026-11-01T09:00:00.000Z" }]);
		const sent = deps.email.sent.length;
		expect(await requestCode(deps, MANAGER, "10.99.0.1")).toBe("limited");
		expect(deps.email.sent).toHaveLength(sent);
		later(23 * 3_600_000);
		expect(await requestCode(deps, MANAGER, "10.99.0.1")).toBe("limited");
		later(3_600_000 + 1);
		expect(await requestCode(deps, MANAGER, "10.99.0.1")).toBe("sent");
		expect(await verifyCode(deps, MANAGER, sentCode(deps), "10.99.0.1", "x")).toMatchObject({ token: expect.any(String) });
	});
	it("refuses even the right code once the day's wrong codes are used up, saying it's held", async () => {
		const { deps } = clocked();
		await requestCode(deps, MANAGER, "10.0.0.1");
		const code = sentCode(deps);
		for (let i = 0; i < LIMITS.wrongPerEmailDay; i++) {
			await deps.db.prepare("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('wrong', ?, ?, ?)").bind(MANAGER, `10.1.${i}.1`, deps.now().toISOString()).run();
		}
		expect(await verifyCode(deps, MANAGER, code, "10.0.0.1", "x")).toBe("held");
		const refuse = async (): Promise<string> => { throw new Error("not signed in"); };
		const res = await handleRequest(new Request("https://saints.example/signin/code", {
			method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "10.0.0.1" }, body: new URLSearchParams({ email: MANAGER, code, next: "/" }),
		}), deps, refuse, buildRouter(), buildAdminRouter());
		expect(res.status).toBe(429);
		expect(await res.text()).toContain(SIGN_IN_MESSAGES.wrongHeld);
		expect(res.headers.getSetCookie()).toEqual([]);
	});
	it("starts afresh when its team manager lets it in: the right code works, and it has its 15 wrong codes again", async () => {
		const { deps, later } = clocked();
		for (let n = 0; n < LIMITS.wrongPerEmailDay / MAX_TRIES; n++) await useUpCode(deps, n);
		await releaseHold(deps.db, MANAGER, deps.now().toISOString());
		later(1000);
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([]);
		expect(await requestCode(deps, MANAGER, "10.99.0.1")).toBe("sent");
		expect(await verifyCode(deps, MANAGER, sentCode(deps), "10.99.0.1", "x")).toMatchObject({ token: expect.any(String) });
	});
	it("the 3am purge keeps a hold that's still on, and one let in within the day, so its counts still start there", async () => {
		const { deps } = clocked();
		const hold = (email: string, until: string, from: string) =>
			deps.db.prepare("INSERT INTO sign_in_holds (email, until, count_from) VALUES (?, ?, ?)").bind(email, until, from).run();
		await hold("over@x.com", "2026-10-29T09:00:00.000Z", "1970-01-01T00:00:00.000Z");
		await hold("held@x.com", "2026-11-01T08:00:00.000Z", "1970-01-01T00:00:00.000Z");
		await hold("letin@x.com", "2026-10-31T02:00:00.000Z", "2026-10-31T02:00:00.000Z");
		await purgeSignInRecords(deps.db, "2026-10-30T09:00:00.000Z", "2026-10-29T09:00:00.000Z");
		const { results } = await deps.db.prepare("SELECT email FROM sign_in_holds ORDER BY email").all<{ email: string }>();
		expect(results.map((r) => r.email)).toEqual(["held@x.com", "letin@x.com"]);
	});
});

describe("guesses sent all at once", () => {
	it("give a code its five tries and no more, however many arrive together from however many addresses", async () => {
		const { deps } = clocked();
		await requestCode(deps, MANAGER, "10.0.0.1");
		const code = sentCode(deps);
		const wrong = wrongFor(code);
		const answers = await Promise.all(Array.from({ length: 12 }, (_, i) => verifyCode(deps, MANAGER, wrong, `10.7.${i}.9`, "x")));
		expect(answers.filter((a) => a === "wrong")).toHaveLength(MAX_TRIES);
		expect(answers.filter((a) => a === "expired")).toHaveLength(12 - MAX_TRIES);
		// Its tries are used up, so even the right code no longer works.
		expect(await verifyCode(deps, MANAGER, code, "10.7.99.9", "x")).toBe("expired");
	});
	it("sign a device in once for one code, even when the right code arrives twice together", async () => {
		const { deps } = clocked();
		await requestCode(deps, MANAGER, "10.0.0.1");
		const code = sentCode(deps);
		const answers = await Promise.all([1, 2, 3].map((i) => verifyCode(deps, MANAGER, code, `10.8.${i}.9`, "x")));
		expect(answers.filter((a) => typeof a === "object")).toHaveLength(1);
		expect(await deps.db.prepare("SELECT count(*) AS n FROM sessions").first<number>("n")).toBe(1);
	});
});
