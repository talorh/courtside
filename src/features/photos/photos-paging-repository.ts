// The Photos page's order (newest taken first; taken the same second, the later added first), read a page or a photo
// at a time, so a page never reads every photo the team has. A photo's place is (taken_at, id): its neighbours are the
// next in that order either way, which keeps photos taken in the same second in their order.
import { ACTIVE, COLUMNS, type Photo, type PhotoRow, toPhoto } from "./photos-repository.ts";

/** Comes after or before photo ?2 in the order (?2's taken_at is null when it isn't on show, so nothing does). */
const BESIDE = (sign: ">" | "<") => `(taken_at, id) ${sign} ((SELECT taken_at FROM photos WHERE team_id = ?1 AND deleted_at IS NULL AND id = ?2), ?2)`;

/**
 * Page `asked` of the team's photos, `per` a page, and how many pages there are: a page past the end is the last one,
 * and a team with none has one, empty. Counted and read in one batch (one transaction), so a photo deleted meanwhile
 * can't leave the page past the new end, empty, when the team has photos.
 */
export async function photosOnPage(db: D1Database, teamId: string, asked: number, per: number): Promise<{ photos: Photo[]; page: number; pages: number }> {
	// Past a billion pages is past the end anyway; kept a whole number SQLite holds exactly.
	const want = Math.min(asked, 1e9);
	const [counted, rows] = await db.batch([
		db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE ${ACTIVE}`).bind(teamId),
		// The page asked for, or the last page when it's past the end: worked out in whole numbers from the same count.
		db.prepare(`SELECT ${COLUMNS} FROM photos WHERE team_id = ?1 AND deleted_at IS NULL ORDER BY taken_at DESC, id DESC
			LIMIT ?2 OFFSET (SELECT (MAX(1, MIN(want, (n + per - 1) / per)) - 1) * per FROM (SELECT CAST(?3 AS INTEGER) AS want,
				CAST(?2 AS INTEGER) AS per, (SELECT COUNT(*) FROM photos WHERE team_id = ?1 AND deleted_at IS NULL) AS n))`)
			.bind(teamId, per, want),
	]);
	const n = (counted!.results[0] as { n: number }).n;
	const pages = Math.max(1, Math.ceil(n / per));
	return { photos: (rows!.results as PhotoRow[]).map(toPhoto), page: Math.min(pages, want), pages };
}

/**
 * A photo on show, the photos either side of it (newer: the one before it on the page; older: the one after), and its
 * place (how many come before it), for the page it's on. One batch, so all four agree. Null when it isn't on show.
 */
export async function photoAndNeighbours(db: D1Database, teamId: string, id: number): Promise<{ photo: Photo; newer: Photo | null; older: Photo | null; place: number } | null> {
	const near = (sign: ">" | "<", order: "ASC" | "DESC") => db
		.prepare(`SELECT ${COLUMNS} FROM photos WHERE team_id = ?1 AND deleted_at IS NULL AND ${BESIDE(sign)} ORDER BY taken_at ${order}, id ${order} LIMIT 1`)
		.bind(teamId, id);
	const [own, newer, older, before] = await db.batch([
		db.prepare(`SELECT ${COLUMNS} FROM photos WHERE ${ACTIVE} AND id = ?`).bind(teamId, id),
		near(">", "ASC"),
		near("<", "DESC"),
		db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE team_id = ?1 AND deleted_at IS NULL AND ${BESIDE(">")}`).bind(teamId, id),
	]);
	const one = (r: D1Result | undefined) => { const row = r?.results[0] as PhotoRow | undefined; return row ? toPhoto(row) : null; };
	const photo = one(own);
	if (!photo) return null;
	return { photo, newer: one(newer), older: one(older), place: (before!.results[0] as { n: number }).n };
}

/** The photos on show among `ids` (each once), oldest added first. */
export async function photosWithIds(db: D1Database, teamId: string, ids: number[]): Promise<Photo[]> {
	const unique = [...new Set(ids)];
	if (!unique.length) return [];
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM photos WHERE ${ACTIVE} AND id IN (${unique.map(() => "?").join(", ")}) ORDER BY id`)
		.bind(teamId, ...unique).all<PhotoRow>();
	return results.map(toPhoto);
}
