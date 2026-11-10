import { afterEach, describe, expect, it, vi } from "vitest";
import { randomToken, sameText, sha256Hex, sixDigitCode } from "../../src/auth/crypto.ts";
import { countLiveSessions, findLiveSession, purgeSessions } from "../../src/auth/session-repository.ts";
import { heldEmails, purgeSignInRecords, releaseHold, signInFigures } from "../../src/auth/sign-in-codes-repository.ts";
import { codeEmailText, spaced } from "../../src/auth/sign-in-mail.ts";
import { LIMITS } from "../../src/auth/sign-in-limits.ts";
import { maskEmail, MAX_TRIES, requestCode, verifyCode } from "../../src/auth/sign-in-service.ts";
import { deviceLabel } from "../../src/shared/device.ts";
import { SIGN_IN_MESSAGES } from "../../src/features/signin/views/signin-page.ts";
import { MANAGER } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addMember } from "../helpers/two-teams.ts";

// The site's own sign-in: a code by email for an address on a team's list, then a
// 30-day session for that device. Unknown addresses get no code, just a line saying the address isn't on a team's list.

afterEach(() => vi.restoreAllMocks());

/** The code the last email carried. */
const sentCode = (deps: TestDeps) => /code is (\d{3}) (\d{3})/.exec(deps.email.sent.at(-1)?.subject ?? "")!.slice(1).join("");

function clocked(start = "2026-10-31T09:00:00.000Z") {
	let now = new Date(start);
	const deps = createTestDeps();
	deps.now = () => now;
	vi.spyOn(console, "log").mockImplementation(() => {});
	return { deps, later: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

describe("the sign-in's random values", () => {
	it("makes six-digit codes, 256-bit tokens and SHA-256 hashes, and compares texts in constant time", async () => {
		for (let i = 0; i < 50; i++) expect(sixDigitCode()).toMatch(/^\d{6}$/);
		expect(new Set(Array.from({ length: 20 }, sixDigitCode)).size).toBeGreaterThan(1);
		expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(randomToken()).not.toBe(randomToken());
		expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
		expect(sameText("482913", "482913")).toBe(true);
		expect(sameText("482913", "482914")).toBe(false);
		expect(sameText("48291", "482913")).toBe(false);
	});
});

describe("asking for a code", () => {
	it("emails a six-digit code to an address on a team's list, from the site, saying how long it's good for", async () => {
		const { deps } = clocked();
		expect(await requestCode(deps, " Sam@saints.example ", "1.2.3.4")).toBe("sent");
		const email = deps.email.sent[0]!;
		expect(email.to).toEqual([MANAGER]);
		expect(email.subject).toMatch(/^Your Courtside sign-in code is \d{3} \d{3}$/);
		expect(email.text).toBe(codeEmailText(sentCode(deps)));
		expect(email.text).toContain("It works for 10 minutes");
		expect(email.text).toContain("If you didn't ask for a code, you can ignore this email");
		expect(spaced("482913")).toBe("482 913");
		expect(maskEmail("sam@saints.example")).toBe("s…@saints.example");
		// Not an address at all: nothing typed goes in the logs but its first letter.
		expect(maskEmail("not an email")).toBe("n…");
		expect(maskEmail("")).toBe("…");
	});
	it("sends nothing to an address that's on no team's list and isn't an admin, or that isn't an address, and says so", async () => {
		const { deps } = clocked();
		expect(await requestCode(deps, "stranger@example.com", "1.2.3.4")).toBe("unknown");
		expect(await requestCode(deps, "not an email", "1.2.3.4")).toBe("unknown");
		expect(deps.email.sent).toEqual([]);
		expect(await signInFigures(deps.db, "2026-10-31T00:00:00.000Z")).toEqual({ codesSent: 0, wrong: 0, refused: 2, signedIn: 0 });
	});
	it("an admin on no team's list, and someone on a closed team's list, still get a code", async () => {
		const { deps } = clocked();
		await deps.db.prepare("UPDATE members SET removed_at = ? WHERE email = ?").bind("2026-10-30T00:00:00.000Z", MANAGER).run();
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
		await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = '2026-10-30T00:00:00.000Z' WHERE id = ?").bind(deps.team.id).run();
		await addMember(deps.db, deps.team.id, "family@x.com", "watcher");
		expect(await requestCode(deps, "family@x.com", "1.2.3.4")).toBe("sent");
	});
	it("logs each request with the address masked, never a code", async () => {
		const { deps } = clocked();
		await requestCode(deps, MANAGER, "1.2.3.4");
		await requestCode(deps, "stranger@example.com", "1.2.3.4");
		const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
		expect(lines).toContain(JSON.stringify({ event: "signin_code_sent", teamId: null, email: "s…@saints.example" }));
		expect(lines).toContain(JSON.stringify({ event: "signin_refused", teamId: null, email: "s…@example.com", why: "unknown" }));
		expect(lines.join("\n")).not.toContain(sentCode(deps));
		expect(maskEmail("ab@c.d")).toBe("a…@c.d");
	});
	it("stops at 10 codes in an hour for one address and holds it for 15 minutes; the hold ending doesn't start the count afresh", async () => {
		const { deps, later } = clocked();
		for (let i = 0; i < LIMITS.emailPerHour; i++) {
			expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
			later(5 * 60_000);
		}
		expect(await requestCode(deps, MANAGER, "5.6.7.8")).toBe("limited");
		expect(deps.email.sent).toHaveLength(10);
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([{ email: MANAGER, until: "2026-10-31T10:05:00.000Z" }]);
		later(14 * 60_000);
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("limited");
		later(60_000 + 1);
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([]);
		// The hour still has 8 of the 10 (9:10 to 9:45), so two more go, then it's held again: 10 an hour, all day.
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("limited");
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([{ email: MANAGER, until: "2026-10-31T10:20:00.001Z" }]);
	});
	it("a code every 7 minutes never adds up to the hour's hold", async () => {
		const { deps, later } = clocked();
		for (let i = 0; i < LIMITS.emailPerDay; i++) {
			expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
			later(7 * 60_000);
		}
	});
	it("a team manager's reset lets a held address ask again at once, with its count started afresh", async () => {
		const { deps, later } = clocked();
		for (let i = 0; i <= LIMITS.emailPerHour; i++) await requestCode(deps, MANAGER, "1.2.3.4");
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("limited");
		await releaseHold(deps.db, "Sam@saints.example", deps.now().toISOString());
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([]);
		later(1000);
		for (let i = 0; i < LIMITS.emailPerHour; i++) expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("limited");
	});
	it("stops at 30 codes in 15 minutes from one IP address, whoever they're for (a gym's Wi-Fi, or a phone company's shared address, is many families)", async () => {
		const { deps } = clocked();
		for (let i = 0; i < LIMITS.ipPer15m; i++) await addMember(deps.db, deps.team.id, `p${i}@x.com`, "watcher");
		for (let i = 0; i < LIMITS.ipPer15m; i++) expect(await requestCode(deps, `p${i}@x.com`, "9.9.9.9")).toBe("sent");
		expect(await requestCode(deps, MANAGER, "9.9.9.9")).toBe("limited");
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([]);
	});
	it("slows an IP address trying address after address that's on no list, as it would one asking for code after code", async () => {
		const { deps } = clocked();
		for (let i = 0; i < LIMITS.unknownPerIp15m; i++) expect(await requestCode(deps, `nobody${i}@example.com`, "9.9.9.9")).toBe("unknown");
		expect(await requestCode(deps, "nobody99@example.com", "9.9.9.9")).toBe("limited");
		expect(await requestCode(deps, MANAGER, "9.9.9.9")).toBe("limited");
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
	});
	it("doesn't count a code the email service dropped against the address", async () => {
		const { deps } = clocked();
		deps.email.failNext = "E_INTERNAL";
		await expect(requestCode(deps, MANAGER, "1.2.3.4")).rejects.toThrow(/E_INTERNAL/);
		expect(await signInFigures(deps.db, "2026-10-31T00:00:00.000Z")).toEqual({ codesSent: 0, wrong: 0, refused: 0, signedIn: 0 });
		for (let i = 0; i < LIMITS.emailPerHour; i++) expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
	});
	it("pauses the whole site at 200 codes an hour and raises one Sign-in flood ticket for the admins, emailed once", async () => {
		const { deps } = clocked();
		for (let i = 0; i < 20; i++) await addMember(deps.db, deps.team.id, `p${i}@x.com`, "watcher");
		for (let i = 0; i < LIMITS.sitePerHour; i++) {
			await deps.db.prepare("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('code_sent', ?, ?, ?)").bind(`p${i % 20}@x.com`, `10.0.${i}.1`, "2026-10-31T08:30:00.000Z").run();
		}
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("limited");
		expect(await requestCode(deps, "p1@x.com", "1.2.3.5")).toBe("limited");
		const tickets = await deps.db.prepare("SELECT alert_kind, title, topic, status FROM support_requests").all();
		expect(tickets.results).toEqual([{ alert_kind: "signin_flood", title: "Sign-in codes paused: too many asked for", topic: "platform", status: "new" }]);
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Courtside: Sign-in codes paused: too many asked for (#1)"]);
	});
});

describe("checking a code", () => {
	it("signs the device in for 30 days: a token for the cookie, its hash in the database, with the device's label", async () => {
		const { deps } = clocked();
		await requestCode(deps, MANAGER, "1.2.3.4");
		const result = await verifyCode(deps, "SAM@saints.example", spaced(sentCode(deps)), "1.2.3.4", "iPhone, Safari");
		expect(result).toMatchObject({ expiresAt: "2026-11-30T09:00:00.000Z" });
		const { token } = result as { token: string };
		const session = await findLiveSession(deps.db, await sha256Hex(token), "2026-11-30T08:59:59.000Z");
		expect(session).toMatchObject({ email: MANAGER, device: "iPhone, Safari", createdAt: "2026-10-31T09:00:00.000Z" });
		expect(await findLiveSession(deps.db, await sha256Hex(token), "2026-11-30T09:00:00.000Z")).toBeNull();
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = ?").bind(token).first("n")).toBe(0);
		// The code is spent: the same one again is nothing.
		expect(await verifyCode(deps, MANAGER, sentCode(deps), "1.2.3.4", "x")).toBe("expired");
	});
	it("a wrong code is wrong until the fifth try, when the code is void; a right one after that is too late", async () => {
		const { deps } = clocked();
		await requestCode(deps, MANAGER, "1.2.3.4");
		const right = sentCode(deps), wrong = right === "000000" ? "000001" : "000000";
		for (let i = 1; i < MAX_TRIES; i++) expect(await verifyCode(deps, MANAGER, wrong, "1.2.3.4", "x")).toBe("wrong");
		expect(await verifyCode(deps, MANAGER, wrong, "1.2.3.4", "x")).toBe("wrong");
		expect(await verifyCode(deps, MANAGER, right, "1.2.3.4", "x")).toBe("expired");
	});
	it("a code runs out after 10 minutes, and a newer code voids the older one", async () => {
		const { deps, later } = clocked();
		await requestCode(deps, MANAGER, "1.2.3.4");
		const first = sentCode(deps);
		later(10 * 60_000);
		expect(await verifyCode(deps, MANAGER, first, "1.2.3.4", "x")).toBe("expired");
		await requestCode(deps, MANAGER, "1.2.3.4");
		const second = sentCode(deps);
		await requestCode(deps, MANAGER, "1.2.3.4");
		expect(await verifyCode(deps, MANAGER, second, "1.2.3.4", "x")).toBe("wrong");
		expect(await verifyCode(deps, MANAGER, sentCode(deps), "1.2.3.4", "x")).toMatchObject({ token: expect.any(String) });
		// The earlier email's code is the easy mistake with two in the inbox, so a wrong code points to the newest email.
		expect(SIGN_IN_MESSAGES.wrong).toBe("That code isn't right. Use the code in the newest email: asking for a new code stops the earlier ones working.");
	});
	it("a code is good for its own email only", async () => {
		const { deps } = clocked();
		await addMember(deps.db, deps.team.id, "family@x.com", "watcher");
		await requestCode(deps, MANAGER, "1.2.3.4");
		const theirs = sentCode(deps);
		await requestCode(deps, "family@x.com", "1.2.3.4");
		expect(await verifyCode(deps, "family@x.com", theirs, "1.2.3.4", "x")).toBe("wrong");
	});
	it("stops an IP address at 30 wrong codes an hour", async () => {
		const { deps, later } = clocked();
		for (let i = 0; i < LIMITS.wrongPerIpHour; i++) {
			await deps.db.prepare("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('wrong', ?, '7.7.7.7', ?)").bind(`p${i}@x.com`, "2026-10-31T08:30:00.000Z").run();
		}
		await requestCode(deps, MANAGER, "1.2.3.4");
		expect(await verifyCode(deps, MANAGER, sentCode(deps), "7.7.7.7", "x")).toBe("limited");
		later(31 * 60_000);
		await requestCode(deps, MANAGER, "1.2.3.4");
		expect(await verifyCode(deps, MANAGER, sentCode(deps), "7.7.7.7", "x")).toMatchObject({ token: expect.any(String) });
	});
	it("several devices at once are several sessions; the 3am purge keeps the live ones", async () => {
		const { deps, later } = clocked();
		await requestCode(deps, MANAGER, "1.2.3.4");
		const a = await verifyCode(deps, MANAGER, sentCode(deps), "1.2.3.4", "iPhone, Safari");
		await requestCode(deps, MANAGER, "1.2.3.4");
		const b = await verifyCode(deps, MANAGER, sentCode(deps), "1.2.3.4", "Android, Chrome");
		expect(a).not.toEqual(b);
		expect(await countLiveSessions(deps.db, deps.now().toISOString())).toBe(2);
		later(31 * 24 * 3_600_000);
		expect(await purgeSessions(deps.db, deps.now().toISOString())).toBe(2);
		await deps.db.prepare("INSERT INTO sign_in_holds (email, until, count_from) VALUES ('a@x.com', ?, ?)").bind("2026-10-31T10:00:00.000Z", "2026-10-31T10:00:00.000Z").run();
		await purgeSignInRecords(deps.db, deps.now().toISOString(), deps.now().toISOString());
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM sign_in_codes").first("n")).toBe(0);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM sign_in_holds").first("n")).toBe(0);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM sign_in_events").first("n")).toBe(0);
	});
	it("labels a device from its browser", () => {
		expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1")).toBe("iPhone, Safari");
		expect(deviceLabel("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36")).toBe("Android, Chrome");
		expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe("Mac, Safari");
		expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0")).toBe("Windows, Firefox");
		expect(deviceLabel("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36")).toBe("Chromebook, Chrome");
		expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0")).toBe("Linux, Firefox");
		expect(deviceLabel(null)).toBe("Device, browser");
	});
});
