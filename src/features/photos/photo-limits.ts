// How many photos can be added. Each is an image in Cloudflare Images, whose allowance every team shares, so a member
// adds at most 500 in any 24 hours and a team 2,000. Checked as each photo's row is reserved (photos-repository.ts).
import type { TeamDeps } from "../../app/deps.ts";
import { HttpError } from "../../app/errors.ts";
import { addDays } from "../../shared/time.ts";
import { whenAgain } from "../../shared/when-again.ts";
import type { Member } from "../members/members-repository.ts";
import { type PhotoLimits, photosAddedSince } from "./photos-repository.ts";

export const MEMBER_PHOTOS_A_DAY = 500;
export const TEAM_PHOTOS_A_DAY = 2000;

export const photoLimits = (now: Date): PhotoLimits => ({ member: MEMBER_PHOTOS_A_DAY, team: TEAM_PHOTOS_A_DAY, since: addDays(now, -1).toISOString() });

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Why a photo was refused and when there's room again, the member's 500 first; null when neither is reached now. */
export async function photoRefusal(deps: TeamDeps, member: Member, limits: PhotoLimits): Promise<HttpError | null> {
	const now = deps.now();
	// When the oldest that count turn a day old, one fewer than the limit is left.
	const again = (added: string[], most: number) => whenAgain(addDays(new Date(added[added.length - most]!), 1), now);
	const mine = await photosAddedSince(deps.db, deps.team.id, limits.since, member.id);
	if (mine.length >= limits.member) {
		return new HttpError(429, "photo_limit", `You've added ${thousands(mine.length)} photos in the last 24 hours, the most one person can add in a day. `
			+ `You can add more from ${again(mine, limits.member)}.`);
	}
	const all = await photosAddedSince(deps.db, deps.team.id, limits.since, null);
	if (all.length >= limits.team) {
		return new HttpError(429, "photo_limit", `The team has added ${thousands(all.length)} photos in the last 24 hours, the most a team can add in a day. `
			+ `More can be added from ${again(all, limits.team)}.`);
	}
	return null;
}
