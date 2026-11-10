import { form, makeClient } from "./app.ts";
import { createTestDeps } from "./fakes.ts";
import { seedGame } from "./seed.ts";

// Test clock: 2026-10-15T00:00Z = 11am Thursday 15 Oct in the club's time zone; the game is tonight. Sam films it.
export async function appGame() {
	let now = new Date("2026-10-15T00:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	const team = deps.team.id;
	await deps.db.prepare(`INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer'), (?, 'alex@x.com', 'filmer'),
		(?, 'coach@x.com', 'coach'), (?, 'fam@x.com', 'watcher')`).bind(team, team, team, team).run();
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40", opponent: "Northside 2" });
	const sam = makeClient(deps, "sam@x.com");
	const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
	const row = () => deps.db.prepare("SELECT source, status, cancel_reason, last_live_at, end_requested_at, recording_video_id, started_by FROM live_streams ORDER BY id DESC")
		.first<{ source: string; status: string; cancel_reason: string | null; last_live_at: string | null; end_requested_at: string | null; recording_video_id: number | null; started_by: number | null }>();
	const choose = (client = sam) => client(`/live/${gameId}/app`, form({}));
	/** Go live for the game: the camera's card, or the external app's once it's chosen. */
	const page = async (client = sam) => (await client(`/live?game=${gameId}`)).text();
	return { deps, gameId, sam, later, row, choose, page, now: () => now };
}
