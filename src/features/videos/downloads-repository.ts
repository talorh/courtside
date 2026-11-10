export type DownloadKind = "hd";

export async function logDownload(
	db: D1Database,
	d: { teamId: string; videoId: number; memberId: number; kind: DownloadKind; nowIso: string },
): Promise<void> {
	await db
		.prepare("INSERT INTO downloads (team_id, video_id, member_id, kind, created_at) VALUES (?, ?, ?, ?, ?)")
		.bind(d.teamId, d.videoId, d.memberId, d.kind, d.nowIso)
		.run();
}

/** A photo or clip downloaded (each photo in a zip is one): the download log's other half. */
export interface MediaDownload { kind: "photo" | "clip"; itemId: number; name: string }

export async function logMediaDownloads(db: D1Database, d: { teamId: string; memberId: number; nowIso: string; items: MediaDownload[] }): Promise<void> {
	if (!d.items.length) return;
	await db.batch(d.items.map((i) => db.prepare("INSERT INTO media_downloads (team_id, member_id, kind, item_id, name, created_at) VALUES (?, ?, ?, ?, ?, ?)")
		.bind(d.teamId, d.memberId, i.kind, i.itemId, i.name, d.nowIso)));
}

/** Retention: the download log, videos', photos' and clips', is kept for 2 years. Returns how many rows were removed. */
export async function purgeDownloadsBefore(db: D1Database, teamId: string, cutoffIso: string): Promise<number> {
	const results = await db.batch([
		db.prepare("DELETE FROM downloads WHERE team_id = ? AND created_at < ?").bind(teamId, cutoffIso),
		db.prepare("DELETE FROM media_downloads WHERE team_id = ? AND created_at < ?").bind(teamId, cutoffIso),
	]);
	return results.reduce((n, r) => n + r.meta.changes, 0);
}
