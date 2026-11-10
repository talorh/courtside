// A video Stream couldn't process opens a ticket for the site's admins, emailed once.
// Each video is its own ticket; the game's page says an alert has been raised.
import type { TeamDeps } from "../../app/deps.ts";
import { findOpenSiteTicket, insertSiteTicket } from "../admin/support-desk-repository.ts";
import { trySend } from "../admin/support-desk-service.ts";
import { getActiveMember } from "../members/members-repository.ts";
import { videoName } from "./video-name.ts";
import type { Video } from "./videos-repository.ts";

export async function ticketFailedVideo(deps: TeamDeps, video: Video, reason: string): Promise<void> {
	const kind = `video_failed:${video.id}`;
	if (await findOpenSiteTicket(deps.db, kind)) return; // failed again, tried again by hand: its ticket is still open
	const name = await videoName(deps, video.gameId);
	const by = video.uploadedBy ? (await getActiveMember(deps.db, deps.team.id, video.uploadedBy))?.name : null;
	const title = `A video couldn't be processed: ${name.title}`;
	const about = [name.when, by ? `uploaded by ${by}` : ""].filter(Boolean).join(", ");
	const message = `${title}.\n${about ? `${about}.\n` : ""}Stream said: ${reason || "no reason given"}`
		+ `\n\nThe game's page says it couldn't be processed and that an alert has been raised. The original upload is kept (R2: ${video.r2Key ?? "none"},`
		+ ` Stream video ${video.streamUid ?? "none"}, site video ${video.id}).\n\nWhat to do: the original can be looked at to save what it can.`
		+ " Otherwise, ask the parent to upload the video again from their phone.";
	const id = await insertSiteTicket(deps.db, { alertKind: kind, title, message, nowIso: deps.now().toISOString(), topic: "videos" });
	await trySend(deps, "ticket", id);
}
