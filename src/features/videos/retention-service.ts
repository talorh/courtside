import type { TeamDeps } from "../../app/deps.ts";
import { runEach } from "../../shared/run-each.ts";
import { addDays, retentionCutoff } from "../../shared/time.ts";
import { purgeActivityBefore } from "../activity/activity-repository.ts";
import { purgeDownloadsBefore } from "./downloads-repository.ts";
import { deleteVideo, purgeMedia } from "./video-removal-service.ts";
import { markPurged } from "./video-writes-repository.ts";
import { purgeViewsBefore, VIEWS_KEPT_DAYS } from "./video-views-repository.ts";
import { listExpiredVideos, listVideosByStatus, listVideosToPurge } from "./videos-repository.ts";

const ABANDONED_AFTER_DAYS = 7;
const BATCH = 15;
const ACTIVITY_DAYS = 90;

/**
 * Videos expire on 31 Dec of the year their season ends (`delete_after`), the download log after 2 years, the activity feed after 90 days, who
 * opened which video after 30 days, and uploads nobody finished within a week are cleaned up. Videos a person deleted
 * lose their media a day later.
 */
export async function enforceRetention(deps: TeamDeps) {
	const { db } = deps;
	const now = deps.now();
	const expired = (await listExpiredVideos(db, deps.team.id, now.toISOString())).slice(0, BATCH);
	const expiredResult = await runEach(expired, (v) => deleteVideo(deps, v, "retention"));
	const cutoff = addDays(now, -ABANDONED_AFTER_DAYS).toISOString();
	const abandoned = (await listVideosByStatus(db, deps.team.id, "uploading")).filter((v) => v.createdAt < cutoff).slice(0, BATCH);
	const abandonedResult = await runEach(abandoned, (v) => deleteVideo(deps, v, "upload_cancelled"));
	const kept = (await listVideosToPurge(db, deps.team.id, now.toISOString())).slice(0, BATCH);
	const purgedResult = await runEach(kept, async (v) => {
		await purgeMedia(deps, v);
		await markPurged(db, deps.team.id, v.id);
	});
	const downloadsPurged = await purgeDownloadsBefore(db, deps.team.id, retentionCutoff(now));
	await purgeActivityBefore(db, deps.team.id, addDays(now, -ACTIVITY_DAYS).toISOString());
	await purgeViewsBefore(db, deps.team.id, addDays(now, -VIEWS_KEPT_DAYS).toISOString());
	return {
		expired: expiredResult.succeeded,
		abandoned: abandonedResult.succeeded,
		purged: purgedResult.succeeded,
		downloadsPurged,
		errors: [...expiredResult.errors, ...abandonedResult.errors, ...purgedResult.errors],
	};
}
