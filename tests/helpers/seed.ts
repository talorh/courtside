import { createGame, type GameInput, getGame } from "../../src/features/games/games-repository.ts";
import type { VideoStatus } from "../../src/features/videos/video-status.ts";
import { form } from "./app.ts";
import type { TestDeps } from "./fakes.ts";

export async function seedGame(deps: TestDeps, overrides: Partial<GameInput> = {}): Promise<number> {
	return createGame(deps.db, deps.team.id, {
		startsAt: "2026-10-11T11:40", competition: "VJBL", roundLabel: "9", opponent: "Lakeside Rockets", venue: "Lakeside Basketball Stadium, Ct 3",
		...overrides,
	}, 1);
}

/** The Fixture's Edit game form for a game as it stands, with `changes` (say `{ video: "none" }`), ready to post. */
export async function gameForm(deps: TestDeps, gameId: number, changes: Record<string, string> = {}): Promise<RequestInit> {
	const g = (await getGame(deps.db, deps.team.id, gameId))!;
	const [date = "", time = ""] = g.startsAt.split("T");
	const [h = 0, m = 0] = time.split(":").map(Number);
	return form({
		date, hour: String(h % 12 || 12), minute: String(m), period: h < 12 ? "am" : "pm", competition: g.competition, roundLabel: g.roundLabel,
		opponent: g.opponent === "TBC" ? "" : g.opponent, venue: g.venue, video: g.noVideo ? "none" : g.liveStream ? "live" : "record", ...changes,
	});
}

interface SeedVideo {
	gameId: number;
	status?: VideoStatus;
	streamUid?: string | null;
	r2Key?: string | null;
	r2UploadId?: string | null;
	originalName?: string | null;
	deleteAfter?: string;
	createdAt?: string;
}

/** A ready video's Stream copy is put in the fake Stream too (as the real one would have it), unless the test did. */
export async function seedVideo(deps: TestDeps, v: SeedVideo): Promise<number> {
	if (v.streamUid && (v.status ?? "ready") === "ready" && !deps.stream.videos.has(v.streamUid)) {
		deps.stream.videos.set(v.streamUid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2830 });
	}
	const r = await deps.db
		.prepare(`INSERT INTO videos (team_id, game_id, status, stream_uid, r2_key, r2_upload_id, original_name,
			original_bytes, duration_seconds, uploaded_by, delete_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
		.bind(deps.team.id, v.gameId, v.status ?? "ready", v.streamUid ?? null, v.r2Key ?? null, v.r2UploadId ?? null,
			v.originalName ?? null, v.r2Key ? 5_600_000_000 : null, 2830, v.deleteAfter ?? "2028-10-14T00:00:00.000Z",
			v.createdAt ?? "2026-10-11T03:00:00.000Z")
		.run();
	return r.meta.last_row_id;
}
