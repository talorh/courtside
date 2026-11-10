import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/auth/crypto.ts";
import { insertSession } from "../../src/auth/session-repository.ts";
import { clearedSessionCookie, currentSession, endRequestSession, readSessionToken, sessionAuthenticator, sessionCookie, sessionTimes } from "../../src/auth/session.ts";
import { noteDeviceView } from "../../src/auth/session-view.ts";
import { MANAGER } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";

// The session cookie is who's asking: hashed, looked up, and the email read from its row.

const NOW = new Date("2026-11-10T09:00:00.000Z");
const req = (cookie?: string, host = "saints.example") => new Request(`https://${host}/games`, { headers: cookie ? { Cookie: cookie } : {} });

async function withSession(o: { createdAt?: string; expiresAt?: string; lastSeenAt?: string | null } = {}) {
	const deps = createTestDeps(NOW);
	const token = "tok-abc_DEF";
	await insertSession(deps.db, { id: await sha256Hex(token), email: "Sam@saints.example", device: "iPhone, Safari", createdAt: o.createdAt ?? "2026-10-31T09:00:00.000Z", expiresAt: o.expiresAt ?? "2026-11-30T09:00:00.000Z" });
	if (o.lastSeenAt !== undefined) await deps.db.prepare("UPDATE sessions SET last_seen_at = ?").bind(o.lastSeenAt).run();
	return { deps, token, auth: sessionAuthenticator({ db: deps.db, now: () => NOW, devAuthEmail: null }) };
}

describe("the session cookie", () => {
	it("is read from among the other cookies, and written HttpOnly, Secure and same-site for 30 days", () => {
		expect(readSessionToken(req("team=u12; courtside_session=abc_D-EF=; viewas=x"))).toBe("abc_D-EF=");
		expect(readSessionToken(req("team=u12"))).toBeNull();
		expect(readSessionToken(req())).toBeNull();
		expect(sessionCookie("abc")).toBe("courtside_session=abc; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000");
		expect(clearedSessionCookie()).toBe("courtside_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
	});
});

describe("sessionAuthenticator", () => {
	it("gives the lower-cased email of a live session", async () => {
		const { auth, token } = await withSession();
		expect(await auth(req(`courtside_session=${token}`))).toBe(MANAGER);
	});
	it("refuses with 401 when there's no cookie, an unknown token, a session that's ended or one past its 30 days", async () => {
		const { auth, token, deps } = await withSession();
		await expect(auth(req())).rejects.toMatchObject({ status: 401, message: "You've been signed out. Reload the page and sign in." });
		await expect(auth(req("courtside_session=someone-elses"))).rejects.toMatchObject({ status: 401 });
		await expect(auth(req(`courtside_session=${await sha256Hex(token)}`))).rejects.toMatchObject({ status: 401 }); // the hash isn't the token
		await endRequestSession(deps.db, req(`courtside_session=${token}`), NOW);
		await expect(auth(req(`courtside_session=${token}`))).rejects.toMatchObject({ status: 401 });
		const old = await withSession({ expiresAt: "2026-11-10T09:00:00.000Z" });
		await expect(old.auth(req(`courtside_session=${old.token}`))).rejects.toMatchObject({ status: 401 });
	});
	it("notes when the session was last seen, at most once an hour", async () => {
		const seen = (deps: ReturnType<typeof createTestDeps>) => deps.db.prepare("SELECT last_seen_at FROM sessions").first("last_seen_at");
		const fresh = await withSession();
		await fresh.auth(req(`courtside_session=${fresh.token}`));
		expect(await seen(fresh.deps)).toBe("2026-11-10T09:00:00.000Z");
		const recent = await withSession({ lastSeenAt: "2026-11-10T08:30:00.000Z" });
		await recent.auth(req(`courtside_session=${recent.token}`));
		expect(await seen(recent.deps)).toBe("2026-11-10T08:30:00.000Z");
		const stale = await withSession({ lastSeenAt: "2026-11-10T07:30:00.000Z" });
		await stale.auth(req(`courtside_session=${stale.token}`));
		expect(await seen(stale.deps)).toBe("2026-11-10T09:00:00.000Z");
	});
	it("the local dev sign-in works on localhost only", async () => {
		const deps = createTestDeps(NOW);
		const auth = sessionAuthenticator({ db: deps.db, now: () => NOW, devAuthEmail: "dev@example.com" });
		expect(await auth(req(undefined, "localhost"))).toBe("dev@example.com");
		await expect(auth(req(undefined, "saints.example"))).rejects.toMatchObject({ status: 401 });
	});
	it("says when a session started and ends (Go live renews one that runs out mid-game)", async () => {
		const { deps, token } = await withSession();
		expect(await sessionTimes(deps.db, req(`courtside_session=${token}`), NOW)).toEqual({ issuedAt: Date.parse("2026-10-31T09:00:00.000Z"), endsAt: Date.parse("2026-11-30T09:00:00.000Z") });
		expect(await sessionTimes(deps.db, req(), NOW)).toBeNull();
		expect(await currentSession(deps.db, req(`courtside_session=${token}`), NOW)).toMatchObject({ device: "iPhone, Safari" });
	});
});

// Which view the device uses (public/view.js says in the courtside_view cookie): noted on the session, a Log line when it's
// first seen or changes, and the device counted in the week's tally for Insights, once a week.
describe("the device's view", () => {
	type Deps = ReturnType<typeof createTestDeps>;
	const row = (deps: Deps) => deps.db.prepare("SELECT view, counted_week FROM sessions").first<{ view: string | null; counted_week: string | null }>();
	const events = async (deps: Deps) => (await deps.db.prepare("SELECT kind, email, ip FROM sign_in_events ORDER BY id").all()).results;
	const weeks = async (deps: Deps) => (await deps.db.prepare("SELECT week, view, devices FROM view_weeks ORDER BY week, view").all()).results;
	const withView = (token: string, view?: string, ip = "1.2.3.4") =>
		new Request("https://saints.example/games", { headers: { Cookie: `courtside_session=${token}${view ? `; courtside_view=${view}` : ""}`, "CF-Connecting-IP": ip } });

	it("notes the view from the cookie with a Log line, and counts the device in this week's tally once", async () => {
		const { auth, token, deps } = await withSession();
		await auth(withView(token, "desktop"));
		// Tue 10 Nov, 8pm in the club's time zone: the week of Mon 9 Nov.
		expect(await row(deps)).toEqual({ view: "desktop", counted_week: "2026-11-09" });
		expect(await events(deps)).toEqual([{ kind: "desktop_view", email: MANAGER, ip: "1.2.3.4" }]);
		expect(await weeks(deps)).toEqual([{ week: "2026-11-09", view: "desktop", devices: 1 }]);
		// The same view again: nothing more.
		await auth(withView(token, "desktop"));
		expect(await events(deps)).toHaveLength(1);
		expect(await weeks(deps)).toEqual([{ week: "2026-11-09", view: "desktop", devices: 1 }]);
		// Switching to the mobile view is a line; the week's tally keeps the view the device was first counted in.
		await auth(withView(token, "mobile", "5.6.7.8"));
		expect((await row(deps))?.view).toBe("mobile");
		expect(await events(deps)).toEqual([{ kind: "desktop_view", email: MANAGER, ip: "1.2.3.4" }, { kind: "mobile_view", email: MANAGER, ip: "5.6.7.8" }]);
		expect(await weeks(deps)).toEqual([{ week: "2026-11-09", view: "desktop", devices: 1 }]);
	});
	it("counts a device again in a new week, in the view it last used, even on a request without the cookie", async () => {
		const { auth, token, deps } = await withSession();
		await deps.db.prepare("UPDATE sessions SET view = 'mobile', counted_week = '2026-11-02'").run();
		await auth(withView(token));
		expect(await row(deps)).toEqual({ view: "mobile", counted_week: "2026-11-09" });
		expect(await weeks(deps)).toEqual([{ week: "2026-11-09", view: "mobile", devices: 1 }]);
		expect(await events(deps)).toEqual([]);
	});
	it("two requests at once from the same device (a page and its scripts, two tabs) make one Log line and count it once", async () => {
		const { token, deps } = await withSession();
		// Both read the session before either wrote: each sees no view and no week counted.
		const session = (await currentSession(deps.db, withView(token, "desktop"), NOW))!;
		await noteDeviceView(deps.db, session, withView(token, "desktop"), NOW);
		await noteDeviceView(deps.db, session, withView(token, "desktop"), NOW);
		expect(await events(deps)).toEqual([{ kind: "desktop_view", email: MANAGER, ip: "1.2.3.4" }]);
		expect(await weeks(deps)).toEqual([{ week: "2026-11-09", view: "desktop", devices: 1 }]);
		expect(await row(deps)).toEqual({ view: "desktop", counted_week: "2026-11-09" });
	});
	it("its Log line says the session's device", async () => {
		const { auth, token, deps } = await withSession();
		await auth(withView(token, "mobile"));
		expect(await deps.db.prepare("SELECT device FROM sign_in_events").all()).toMatchObject({ results: [{ device: "iPhone, Safari" }] });
	});
	it("does nothing until the view is known, and ignores a cookie that says anything else", async () => {
		const { auth, token, deps } = await withSession();
		await auth(withView(token));
		await auth(withView(token, "tablet"));
		expect(await row(deps)).toEqual({ view: null, counted_week: null });
		expect(await weeks(deps)).toEqual([]);
		expect(await events(deps)).toEqual([]);
	});
});
