import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../src/auth/crypto.ts";
import { insertSession } from "../../../src/auth/session-repository.ts";
import { advanceBrowserLive } from "../../../src/features/live/browser-live-service.ts";
import { listOpenLive } from "../../../src/features/live/live-repository.ts";
import { advanceStream } from "../../../src/features/live/live-sync.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { gameForm, seedGame } from "../../helpers/seed.ts";

// Test clock: 2026-10-15T00:00Z = 11am Thursday 15 Oct in the club's time zone.
function clocked() {
	let now = new Date("2026-10-15T00:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	return { deps, client: makeClient(deps), later: (seconds: number) => { now = new Date(now.getTime() + seconds * 1000); } };
}

type Row = { status: string; end_requested_at: string | null; cancel_reason: string | null };
const rows = async (deps: TestDeps) =>
	(await deps.db.prepare("SELECT status, end_requested_at, cancel_reason FROM live_streams ORDER BY id").all<Row>()).results;

const goLive = async (client: ReturnType<typeof makeClient>, gameId: number) =>
	((await (await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).json()) as { data: { videoId: number } }).data;

describe("Stream not answering", () => {
	it("End game still ends the game's stream, and the recording still saves", async () => {
		const { deps, client, later } = clocked();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const { videoId } = await goLive(client, gameId);
		later(30 * 60);
		deps.live.down = true;
		expect((await client(`/api/live/${gameId}/end`, jsonBody({}))).status).toBe(200);
		expect((await rows(deps))[0]).toMatchObject({ status: "open", end_requested_at: expect.any(String) });
		expect((await client(`/api/uploads/${videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }))).status).toBe(200);
		expect((await rows(deps))[0]).toMatchObject({ status: "saved" });
	});

	it("a test's Stop still frees the game", async () => {
		const { deps, client, later } = clocked();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		await goLive(client, gameId);
		later(20);
		deps.live.down = true;
		const res = await client(`/api/live/${gameId}/end`, jsonBody({}));
		expect(await res.json()).toMatchObject({ ok: true, data: { status: "test" } });
		expect((await rows(deps))[0]).toMatchObject({ status: "cancelled", cancel_reason: expect.stringContaining("treated as a test") });
	});

	it("No video and the cron's tidy-up still close streams that were only set up", async () => {
		const { deps, client, later } = clocked();
		const a = await seedGame(deps, { startsAt: "2026-10-16T18:40", opponent: "A" });
		const b = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "B" });
		await client(`/live?game=${a}`);
		await client(`/live?game=${b}`);
		deps.live.down = true;
		expect((await client(`/fixture/${a}`, await gameForm(deps, a, { video: "none" }))).status).toBe(303);
		later(25 * 3600);
		await runSync(deps);
		expect((await rows(deps)).map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
	});

	it("the Go live page never fails because of Stream", async () => {
		const { deps, client } = clocked();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const { videoId } = await goLive(client, gameId);
		deps.live.down = true;
		// A recording on its way: the page shows it (to save it) without asking Stream for anything.
		const page = await client("/live");
		expect(page.status).toBe(200);
		expect(await page.text()).toContain(`data-recording="${videoId}"`);
		// A game with nothing set up yet: the page says Go live can't start just now, not an error page.
		const next = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Next" });
		const other = await client(`/live?game=${next}`);
		expect(other.status).toBe(200);
		expect(await other.text()).toContain("Go live can&#39;t start just now");
	});
});

describe("which game Go live picks", () => {
	it("on a day with two games: the one still to finish, not the one that's over; the one being filmed first", async () => {
		const { deps, client } = clocked();
		const morning = await seedGame(deps, { startsAt: "2026-10-15T09:00", competition: "Tournament", opponent: "Morning" });
		const afternoon = await seedGame(deps, { startsAt: "2026-10-15T13:00", competition: "Tournament", opponent: "Afternoon" });
		expect(await (await client("/live")).text()).toContain(`<option value="${afternoon}" selected>`);
		await goLive(client, morning);
		expect(await (await client("/live")).text()).toContain(`<option value="${morning}" selected>`);
	});
	it("back to back: the game starting in the next half hour, not the one under way that nobody's streaming", async () => {
		const { deps, client } = clocked(); // 11am
		await seedGame(deps, { startsAt: "2026-10-15T10:30", competition: "Tournament", opponent: "Earlier" });
		const next = await seedGame(deps, { startsAt: "2026-10-15T11:20", competition: "Tournament", opponent: "Next" });
		expect(await (await client("/live")).text()).toContain(`<option value="${next}" selected>`);
	});
	it("the game under way still, when the next one is more than half an hour off", async () => {
		const { deps, client } = clocked(); // 11am
		const underWay = await seedGame(deps, { startsAt: "2026-10-15T10:30", competition: "Tournament", opponent: "Earlier" });
		await seedGame(deps, { startsAt: "2026-10-15T12:30", competition: "Tournament", opponent: "Later" });
		expect(await (await client("/live")).text()).toContain(`<option value="${underWay}" selected>`);
	});
});

describe("a sign-in that runs out during the game", () => {
	// A session for Sam's phone (the site's own sign-in), and the request's cookies for it.
	const signedIn = async (deps: TestDeps, endsInHours: number) => {
		const token = `tok-${endsInHours}`, start = Date.parse("2026-10-15T00:00:00Z");
		await insertSession(deps.db, { id: await sha256Hex(token), email: "sam@saints.example", device: "iPhone, Safari", createdAt: new Date(start - 716 * 3_600_000).toISOString(), expiresAt: new Date(start + endsInHours * 3_600_000).toISOString() });
		return { headers: { Cookie: `team=${deps.team.id}; courtside_session=${token}` } };
	};
	it("Go live ends a session that runs out in the next four hours and asks for a new code, coming back to the game", async () => {
		const { deps, client } = clocked();
		await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const renew = await client("/live?game=1", await signedIn(deps, 2));
		expect(renew.status).toBe(303);
		expect(renew.headers.get("Location")).toBe("/signin?next=%2Flive%3Fgame%3D1");
		expect(renew.headers.get("Set-Cookie")).toContain("courtside_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
		expect(await deps.db.prepare("SELECT ended_at FROM sessions").first("ended_at")).toBe("2026-10-15T00:00:00.000Z");
	});
	it("leaves a session with plenty of time, and a request with none at all (local dev), alone", async () => {
		const { deps, client } = clocked();
		await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		expect((await client("/live", await signedIn(deps, 240))).status).toBe(200);
		expect((await client("/live")).status).toBe(200);
	});
});

describe("the 5-minute run tidying up from what it read a moment before", () => {
	it("doesn't close a stream whose deleted recording a new one has just replaced", async () => {
		const { deps, client, later } = clocked();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const first = await goLive(client, gameId);
		later(5 * 60);
		await client(`/api/uploads/${first.videoId}/abort`, jsonBody({})); // Delete it and start again
		const [read] = await listOpenLive(deps.db, deps.team.id); // the run reads the streams...
		await goLive(client, gameId); // ...the filmer goes live again...
		await advanceBrowserLive(deps, read!, false); // ...and the run carries on with what it read
		expect((await rows(deps))[0]).toMatchObject({ status: "open", cancel_reason: null });
		expect(deps.live.inputs.get("live-1")?.enabled).toBe(true);
	});
});

describe("the 5-minute run closing a stream nobody used", () => {
	it("doesn't close a day-old stream that Go live has just started recording", async () => {
		const { deps, client, later } = clocked();
		const gameId = await seedGame(deps, { startsAt: "2026-10-16T18:40" });
		await client(`/live?game=${gameId}`); // Go live opened the day before: the stream is set up
		later(24 * 3600 + 60);
		const [read] = await listOpenLive(deps.db, deps.team.id); // a day on, the run reads it as unused...
		await goLive(client, gameId); // ...the filmer taps Go live in that moment...
		await advanceStream(deps, read!, { liveNow: 0 }); // ...and the run carries on with what it read
		expect((await rows(deps))[0]).toMatchObject({ status: "open" });
		expect(deps.live.inputs.get("live-1")?.enabled).toBe(true);
	});
});

describe("a stream nobody used is closed a day after Go live was last opened for it", () => {
	it("so one set up the day before stays open on game day once the filmer opens Go live again", async () => {
		const { deps, client, later } = clocked();
		const gameId = await seedGame(deps, { startsAt: "2026-10-16T18:40" });
		await client(`/live?game=${gameId}`); // opened the day before, to check it works
		later(20 * 3600);
		await client(`/live?game=${gameId}`); // game day: opened again before tip-off
		later(10 * 3600);
		await runSync(deps); // 30 hours after the first visit, 10 after the last
		expect((await rows(deps))[0]).toMatchObject({ status: "open" });
		expect(deps.live.inputs.get("live-1")?.enabled).toBe(true);
		later(15 * 3600);
		await runSync(deps); // and closed once nobody's opened it for a day
		expect((await rows(deps))[0]).toMatchObject({ status: "cancelled" });
	});
});

describe("the 5-minute run and a filmer opening Go live in the same moment", () => {
	it("doesn't close a day-old stream the filmer has just opened Go live for (before they tap it)", async () => {
		const { deps, client, later } = clocked();
		const gameId = await seedGame(deps, { startsAt: "2026-10-16T18:40" });
		await client(`/live?game=${gameId}`);
		later(24 * 3600 + 60);
		const [read] = await listOpenLive(deps.db, deps.team.id); // the run reads it as a day old...
		await client(`/live?game=${gameId}`); // ...the filmer opens Go live at the stadium...
		await advanceStream(deps, read!, { liveNow: 0 }); // ...and the run carries on with what it read
		expect((await rows(deps))[0]).toMatchObject({ status: "open" });
		expect(deps.live.inputs.get("live-1")?.enabled).toBe(true);
	});
});
