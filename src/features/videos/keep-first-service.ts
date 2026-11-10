// Keep the first part: a team manager's way out when a carried-on recording's parts couldn't be joined (six tries,
// live/join-service.ts). Segment 1 becomes the game video; the later segments go. Nobody outside the team is needed.
import type { TeamDeps } from "../../app/deps.ts";
import { conflict } from "../../app/errors.ts";
import { setAlert } from "../admin/alerts-service.ts";
import { logLive } from "../live/live-log.ts";
import { listSegments, replaceSegmentsWith } from "../live/recording-segments-repository.ts";
import { requestStreamCopy } from "./upload-finish.ts";
import type { Video } from "./videos-repository.ts";

export async function keepFirstPart(deps: TeamDeps, video: Video, who: string): Promise<void> {
	if (!video.joinFailedAt || !video.r2Key) throw conflict("The video's parts are still being joined. Give it an hour, then look again.");
	const segments = await listSegments(deps.db, deps.team.id, video.id);
	for (const s of segments) {
		if (s.r2UploadId) await deps.originals.abort(s.r2Key, s.r2UploadId);
		else await deps.originals.remove(s.r2Key);
	}
	await replaceSegmentsWith(deps.db, deps.team.id, video.id, video.r2Key);
	await logLive(deps, who, "first_part_kept", video.gameId, `the first of ${segments.length + 1} parts kept as the game video; the rest deleted`);
	await setAlert(deps, "joiner", "ok", "The game waiting on it was dealt with: its first part was kept");
	await requestStreamCopy(deps, { ...video, status: "processing", r2UploadId: null, joinFailedAt: null });
}
