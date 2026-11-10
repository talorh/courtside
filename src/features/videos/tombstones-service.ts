import type { TeamDeps } from "../../app/deps.ts";
import { runEach } from "../../shared/run-each.ts";
import { addDays } from "../../shared/time.ts";
import {
	clipTombstoneWrites, gameTombstoneWrites, listTombstones, photoTombstoneWrites, type TombstoneKind, videoTombstoneWrites,
} from "./tombstones-repository.ts";

/** A deleted row stays this long after its deletion before it goes for good (the activity feed keeps the same). */
export const TOMBSTONE_DAYS = 90;
const BATCH = 10;
const PHOTO_BATCH = 20;

const WRITES: Record<TombstoneKind, (db: D1Database, teamId: string, id: number) => D1PreparedStatement[]> = {
	video: videoTombstoneWrites, clip: clipTombstoneWrites, game: gameTombstoneWrites, photo: photoTombstoneWrites,
};

/**
 * Rows deleted over 90 days ago, their media long gone, that nothing kept names: the download log (two years) and a
 * removal request keep a video; a request or a favourite keeps a clip; a kept video keeps its game. Each goes with its
 * own children in one batch, a few a run (one read and a batch a row: D1 trips, no outside calls); a game follows its
 * last video.
 */
export async function clearTombstones(deps: TeamDeps) {
	const { db } = deps, teamId = deps.team.id;
	const before = addDays(deps.now(), -TOMBSTONE_DAYS).toISOString();
	const found = await listTombstones(db, teamId, before, BATCH, PHOTO_BATCH);
	const result = await runEach(found, async ({ kind, id }) => void (await db.batch(WRITES[kind](db, teamId, id))));
	return { tombstonesCleared: result.succeeded, errors: result.errors };
}
