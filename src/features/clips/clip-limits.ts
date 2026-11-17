// How many clips can be made. Each is a video of its own in Stream, whose storage every team shares: when it's full, no
// team can upload or go live. So a game video has at most 50 clips, a member makes at most an hour of clips a day, and a
// team five hours. A clip's place is taken, against all three, before Stream is asked for it (clip-limits-repository.ts).
import type { TeamDeps } from "../../app/deps.ts";
import { conflict, HttpError } from "../../app/errors.ts";
import { addDays, formatClock, localDate, localTime } from "../../shared/time.ts";
import type { Member } from "../members/members-repository.ts";
import { clipsMadeSince, countVideoClips, dropStaleReservedClips, type NewClip, reserveClip } from "./clip-limits-repository.ts";

export const MAX_CLIPS_PER_VIDEO = 50;
export const MEMBER_CLIP_SECONDS_A_DAY = 3600;
export const TEAM_CLIP_SECONDS_A_DAY = 5 * 3600;
const MIN_SHORTER = 3;
/** A place Stream's clip never filled in this long (the Worker stopped after taking it) is given back. */
const PLACE_KEPT_MS = 10 * 60_000;

/** '1 hour', '4 hours 58 minutes', '45 seconds'. */
export function lengthWords(seconds: number): string {
	if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
	const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
	const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "", minutes = m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
	return [hours, minutes].filter(Boolean).join(" ");
}

/** '9:00pm', or '5:00pm tomorrow'. */
const whenWords = (at: Date, now: Date) => `${formatClock(localTime(at).slice(11))}${localDate(at) === localDate(now) ? "" : " tomorrow"}`;

/** When a clip `seconds` long fits under `limit`, as the oldest of `made` (seconds and when, oldest first) turn a day old. */
function fitsAt(made: Array<{ seconds: number; createdAt: string }>, limit: number, seconds: number): Date {
	let used = made.reduce((sum, c) => sum + c.seconds, 0);
	for (const c of made) {
		used -= c.seconds;
		if (used + seconds <= limit) return addDays(new Date(c.createdAt), 1);
	}
	return addDays(new Date(made.at(-1)?.createdAt ?? 0), 1);
}

/** Why a clip was refused, and when it can be made: a member's hour first, then the team's five hours. */
async function refusal(deps: TeamDeps, member: Member, c: NewClip, since: string, now: Date): Promise<HttpError> {
	if ((await countVideoClips(deps.db, deps.team.id, c.videoId)) >= MAX_CLIPS_PER_VIDEO) return conflict(`This game already has ${MAX_CLIPS_PER_VIDEO} clips.`);
	const seconds = c.endSeconds - c.startSeconds;
	const all = await clipsMadeSince(deps.db, deps.team.id, since);
	const mine = all.filter((x) => x.createdBy === member.id);
	const limit = (made: typeof all, most: number, rule: string, who: string) => {
		const used = made.reduce((sum, x) => sum + x.seconds, 0);
		if (used + seconds <= most) return null;
		const room = most - used;
		const shorter = room >= MIN_SHORTER ? `, or one up to ${lengthWords(room)} long now` : "";
		return new HttpError(429, "clip_limit", `${rule}, and ${who} made ${lengthWords(used)} of clips in the last 24 hours. `
			+ `This one can be made from ${whenWords(fitsAt(made, most, seconds), now)}${shorter}.`);
	};
	return limit(mine, MEMBER_CLIP_SECONDS_A_DAY, "Clips are up to an hour a day for each person", "you've")
		?? limit(all, TEAM_CLIP_SECONDS_A_DAY, "Clips are up to 5 hours a day for each team, to keep video storage free for games", "the team has")
		// Nothing over a limit now: one was a moment ago (a clip that hadn't been made let go of its place).
		?? new HttpError(503, "clip_busy", "Couldn't make the clip just now. Please try again.");
}

/** The new clip's place (its row, with no Stream uid yet), or the reason it can't be made. */
export async function takeClipPlace(deps: TeamDeps, member: Member, c: Omit<NewClip, "createdBy" | "createdAt">): Promise<number> {
	const now = deps.now();
	const since = addDays(now, -1).toISOString();
	const clip = { ...c, createdBy: member.id, createdAt: now.toISOString() };
	const id = await reserveClip(deps.db, deps.team.id, clip, {
		perVideo: MAX_CLIPS_PER_VIDEO, memberSeconds: MEMBER_CLIP_SECONDS_A_DAY, teamSeconds: TEAM_CLIP_SECONDS_A_DAY, since,
	});
	if (id === null) throw await refusal(deps, member, clip, since, now);
	return id;
}

/** The cron's: places taken but never filled, given back once they're PLACE_KEPT_MS old (asking only when there are some). */
export async function giveBackStalePlaces(deps: TeamDeps, places: Array<{ createdAt: string }>): Promise<void> {
	const before = new Date(deps.now().getTime() - PLACE_KEPT_MS).toISOString();
	if (places.some((p) => p.createdAt < before)) await dropStaleReservedClips(deps.db, deps.team.id, before);
}
