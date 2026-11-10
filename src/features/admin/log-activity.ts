// Activity's lines in the admin Log, in words: what families and filming parents did with videos, clips and photos, and
// what the site did with the videos (ready to watch, couldn't be processed, HD download ready). `t` is the team ("Saints
// G14.5"), `g` the game ("Round 6 · vs Lakeside Rockets, Fri 13 Nov"), `d` the line's detail (a reason, a clip's name).
import { SITE_KINDS } from "../activity/activity-repository.ts";
import { gameName } from "../games/game-log.ts";
import type { ActivityLogLine, LogActivityKind } from "./activity-admin-repository.ts";

const quoted = (d: string | null) => (d ? `: “${d}”` : "");

const WHAT: Record<LogActivityKind, (t: string, g: string, d: string | null) => string> = {
	upload_started: (t, g) => `started uploading ${t}'s video of ${g}`,
	upload_finished: (t, g) => `finished uploading ${t}'s video of ${g}`,
	video_ready: (t, g) => `${t}'s video of ${g} is ready to watch`,
	video_failed: (t, g, d) => `${t}'s video of ${g} couldn't be processed${d ? `: ${d}` : ""}`,
	hd_ready: (t, g) => `${t}'s HD download of ${g} is ready`,
	clip_made: (t, g, d) => `made a highlight clip of ${t}'s game ${g}${quoted(d)}`,
	removal_requested: (t, g, d) => `asked for ${t}'s video of ${g} to be removed${quoted(d)}`,
	clip_removal_requested: (t, g, d) => `asked for a highlight clip of ${t}'s game ${g} to be removed${quoted(d)}`,
	photo_removal_requested: (t, _g, d) => `asked for one of ${t}'s photos to be removed${quoted(d)}`,
};

/** Who it was ("site" for what the site did by itself) and what happened, as the Log's row says it. */
export function activityWords(a: ActivityLogLine, team: string): { who: string; what: string } {
	const game = a.game ? gameName(a.game) : "a deleted game";
	return { who: SITE_KINDS.includes(a.kind) ? "site" : a.email, what: WHAT[a.kind](team, game, a.detail) };
}
