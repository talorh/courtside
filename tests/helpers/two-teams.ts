import { weekOf } from "../../src/features/roster/roster-plan.ts";
import type { Team } from "../../src/features/teams/team.ts";
import type { TestDeps } from "./fakes.ts";

/** A second team, as an admin would onboard it: no ask name, so the site says "your team manager". */
export const G14_5: Team = { id: "g14.5-2026", code: "g14.5", name: "Saints U14 Girls 14.5", seasonStart: 2026, askName: null, status: "active", closedAt: null, deleteAfter: null };

export async function addTeam(db: D1Database, team: Team = G14_5): Promise<Team> {
	await db.prepare("INSERT INTO teams (id, name, code, season_start, ask_name, status, closed_at, delete_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
		.bind(team.id, team.name, team.code, team.seasonStart, team.askName, team.status, team.closedAt, team.deleteAfter).run();
	return team;
}

/** A member of `teamId`; returns their id. */
export async function addMember(db: D1Database, teamId: string, email: string, role: string, name = ""): Promise<number> {
	const r = await db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(teamId, email, name, role).run();
	return r.meta.last_row_id;
}

/** One of everything a team has, and the words that are only that team's (no other team's page may show them). */
export interface Seeded {
	team: Team;
	emails: { manager: string; coach: string; filmer: string; watcher: string };
	members: { manager: number; coach: number; filmer: number; watcher: number };
	gameId: number; videoId: number; clipId: number; photoId: number; playerId: number; noteId: number; familyId: number; fixtureId: number;
	removalId: number; clipRemovalId: number; photoRemovalId: number; supportId: number;
	week: string; playhqUrl: string;
	secrets: string[];
}

const NOW = "2026-10-12T00:00:00.000Z";

/**
 * Members in every role, a played game with its ready video, a clip with a player tagged, a coach's note, a score, a
 * photo, a roster family, a PlayHQ fixture, a starred game and an open removal request for the video, the clip and the
 * photo. `tag` makes every name, email and media id the team's own. B12.1 keeps Sam as its team manager.
 */
export async function seedTeam(deps: TestDeps, team: Team, tag: string): Promise<Seeded> {
	const { db } = deps;
	const t = team.id;
	const run = async (sql: string, ...values: unknown[]) => (await db.prepare(sql).bind(...values).run()).meta.last_row_id;
	const emails = { manager: `manager-${tag}@x.com`, coach: `coach-${tag}@x.com`, filmer: `filmer-${tag}@x.com`, watcher: `parent-${tag}@x.com` };
	const manager = await db.prepare("SELECT id FROM members WHERE team_id = ? AND role = 'manager' AND removed_at IS NULL").bind(t).first<number>("id");
	const members = {
		manager: manager ?? await addMember(db, t, emails.manager, "manager", `Manager ${tag}`),
		coach: await addMember(db, t, emails.coach, "coach", `Coach ${tag}`),
		filmer: await addMember(db, t, emails.filmer, "filmer", `Filmer ${tag}`),
		watcher: await addMember(db, t, emails.watcher, "watcher", `Parent ${tag}`),
	};
	if (manager) emails.manager = "sam@saints.example";
	const gameId = await run("INSERT INTO games (team_id, starts_at, competition, round_label, opponent, venue, created_by, live_stream) VALUES (?, '2026-10-11T11:40', 'VJBL', '9', ?, ?, ?, 0)",
		t, `Opponent ${tag}`, `Venue ${tag}`, members.manager);
	const streamUid = `stream-${tag}`;
	const videoId = await run(`INSERT INTO videos (team_id, game_id, status, stream_uid, duration_seconds, uploaded_by, delete_after, created_at, hd_ready_at)
		VALUES (?, ?, 'ready', ?, 2830, ?, '2027-12-31T13:00:00.000Z', '2026-10-11T03:00:00.000Z', '2026-10-11T04:00:00.000Z')`, t, gameId, streamUid, members.filmer);
	deps.stream.videos.set(streamUid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2830 });
	deps.stream.downloads.set(streamUid, "ready");
	const clipUid = `clip-${tag}`;
	const clipId = await run("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid, created_by) VALUES (?, ?, ?, 10, 25, 'ready', ?, ?)",
		t, videoId, `Steal ${tag}`, clipUid, members.filmer);
	deps.stream.videos.set(clipUid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 15 });
	deps.stream.downloads.set(clipUid, "ready");
	const playerId = await run("INSERT INTO players (team_id, number, name) VALUES (?, 77, ?)", t, `Player${tag}`);
	await run("INSERT INTO clip_players (team_id, clip_id, player_id) VALUES (?, ?, ?)", t, clipId, playerId);
	const noteId = await run("INSERT INTO coach_notes (team_id, game_id, at_seconds, body, created_by) VALUES (?, ?, 60, ?, ?)", t, gameId, `Note ${tag}`, members.coach);
	await run("INSERT INTO game_scores (team_id, game_id, ours, opponent, source, entered_by, entered_at) VALUES (?, ?, 51, 42, 'manual', ?, ?)", t, gameId, members.manager, NOW);
	const imageId = `img-${tag}`;
	deps.images.stored.set(imageId, { bytes: new Uint8Array([1, 2, 3]), teamId: t, uploadedBy: members.filmer, uploaded: NOW });
	const photoId = await run(`INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at)
		VALUES (?, ?, '2026-10-11T12:00:00', 400, 300, 3, ?, '2027-12-31T13:00:00.000Z', ?)`, t, imageId, members.filmer, NOW);
	const familyId = await run("INSERT INTO roster_families (team_id, surname) VALUES (?, ?)", t, `Family${tag}`);
	// A PlayHQ team page's id is hex; PlayHQ (the fake) knows the team, with no games yet.
	const playhqId = Buffer.from(tag).toString("hex").padStart(8, "0");
	deps.playhq.teams.set(playhqId, { name: `PlayHQ ${tag}`, games: [] });
	const playhqUrl = `https://www.playhq.com/example-association/org/saints/3d1e/teams/ours-${tag}/${playhqId}`;
	const fixtureId = await run("INSERT INTO playhq_fixtures (team_id, competition, playhq_team_id, url, name) VALUES (?, 'VJBL', ?, ?, ?)",
		t, playhqId, playhqUrl, `PlayHQ ${tag}`);
	await run("INSERT INTO favourites (team_id, member_id, game_id, created_at) VALUES (?, ?, ?, ?)", t, members.watcher, gameId, NOW);
	const removalId = await run("INSERT INTO removal_requests (team_id, video_id, member_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", t, videoId, members.watcher, `Reason ${tag}`, NOW);
	const clipRemovalId = await run("INSERT INTO clip_removal_requests (team_id, clip_id, member_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", t, clipId, members.watcher, `Clip reason ${tag}`, NOW);
	const photoRemovalId = await run("INSERT INTO photo_removal_requests (team_id, photo_id, member_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", t, photoId, members.watcher, `Photo reason ${tag}`, NOW);
	const supportId = await run("INSERT INTO support_requests (team_id, member_id, topic, message, contact, emailed_at, created_at, updated_at) VALUES (?, ?, 'other', ?, 'x', ?, ?, ?)",
		t, members.manager, `Support ${tag}`, NOW, NOW, NOW);
	const secrets = [`Opponent ${tag}`, `Venue ${tag}`, `Steal ${tag}`, `Player${tag}`, `Note ${tag}`, `Family${tag}`, `PlayHQ ${tag}`, `Reason ${tag}`, `Support ${tag}`,
		streamUid, clipUid, imageId, ...Object.values(emails).filter((e) => !e.startsWith("manager")), `Coach ${tag}`, `Filmer ${tag}`, `Parent ${tag}`];
	return {
		team, emails, members, gameId, videoId, clipId, photoId, playerId, noteId, familyId, fixtureId, removalId, clipRemovalId, photoRemovalId, supportId,
		week: weekOf("2026-10-11"), playhqUrl, secrets,
	};
}

/** Every row of every table that has a team_id, for `teamId`: what a test compares before and after. */
export async function teamSnapshot(db: D1Database, teamId: string): Promise<string> {
	const { results: tables } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%team_id%' ORDER BY name").all<{ name: string }>();
	const rows: Record<string, unknown[]> = {};
	for (const { name } of tables) rows[name] = (await db.prepare(`SELECT * FROM ${name} WHERE team_id = ? ORDER BY rowid`).bind(teamId).all()).results;
	return JSON.stringify(rows);
}
