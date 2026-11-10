import { badRequest, conflict, notFound } from "../../app/errors.ts";
import type { Role } from "../../auth/permissions.ts";
import { heldEmails, releaseHold } from "../../auth/sign-in-codes-repository.ts";
import { localDate } from "../../shared/time.ts";
import {
	countActiveManagers, getActiveMember, listActiveMembers, markMemberRemoved, type Member, updateMemberDetails, upsertMembers,
} from "./members-repository.ts";

// No limit on a team's people, nor across teams:
// the site signs people in itself, so nobody costs a seat. The counts still show, on Manage team, Teams and Insights.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (text: string) => EMAIL.test(text);

/** A person to add: their email, their name, and their role. */
export interface NewPerson { email: string; name: string; role: Role }

/** The people worth adding: blank ones skipped, each address trimmed and lower-cased, a repeat kept once. A name with no
 * email, or an email that isn't one, is a mistake to fix, not something to skip. */
export function tidyRows(rows: NewPerson[]): NewPerson[] {
	const seen = new Set<string>();
	const tidy: NewPerson[] = [];
	for (const row of rows) {
		const email = row.email.trim().toLowerCase(), name = row.name.trim();
		if (!email && !name) continue;
		if (!email) throw badRequest(`Enter an email address for ${name}.`);
		if (!isEmail(email)) throw badRequest(`"${email}" isn't an email address.`);
		if (seen.has(email)) continue;
		seen.add(email);
		tidy.push({ email, name, role: row.role });
	}
	if (tidy.length === 0) throw badRequest("Enter an email address.");
	return tidy;
}

/** Adds the new people (or previously removed ones), each with their own name and role. People already on the list are
 * left exactly as they are. Returns who was added. */
export async function addMembers(db: D1Database, teamId: string, rows: NewPerson[]): Promise<NewPerson[]> {
	const people = tidyRows(rows);
	const existing = new Set((await listActiveMembers(db, teamId)).map((m) => m.email.toLowerCase()));
	const fresh = people.filter((p) => !existing.has(p.email));
	if (fresh.length === 0) {
		throw conflict("They're already on the list. Change their name or role in the list instead.");
	}
	await upsertMembers(db, teamId, fresh);
	return fresh;
}

/** A member Manage team lists: an admin's hidden way into the team isn't one, so a team manager can't change it. */
async function listedMember(db: D1Database, teamId: string, memberId: number): Promise<Member> {
	const member = await getActiveMember(db, teamId, memberId);
	if (!member || member.hidden) throw notFound("Member");
	return member;
}

/** Saves a member's name and role, and returns the person as they were before. The team must always keep at least one
 * team manager. */
export async function updateMember(db: D1Database, teamId: string, memberId: number, details: { name: string; role: Role }): Promise<Member> {
	const member = await listedMember(db, teamId, memberId);
	if (member.role === "manager" && details.role !== "manager" && (await countActiveManagers(db, teamId)) <= 1) {
		throw conflict("The team needs at least one team manager.");
	}
	await updateMemberDetails(db, teamId, memberId, { name: details.name.trim(), role: details.role });
	return member;
}

/** How many people, by role, and how recently each last opened the site (their Last seen): Manage team's summary. */
export interface MemberActivity { total: number; byRole: Record<Role, number>; week: number; month: number; older: number; never: number }

const DAY_MS = 86_400_000;

/** Last seen within 7 days counts as this week, within 30 as this month; none yet means not signed in yet. */
export function memberActivity(members: Member[], now: Date): MemberActivity {
	const activity: MemberActivity = { total: members.length, byRole: { watcher: 0, filmer: 0, coach: 0, manager: 0 }, week: 0, month: 0, older: 0, never: 0 };
	for (const m of members) {
		activity.byRole[m.role]++;
		const days = m.lastSeenAt === null ? null : (now.getTime() - Date.parse(m.lastSeenAt)) / DAY_MS;
		if (days === null) activity.never++;
		else if (days <= 7) activity.week++;
		else if (days <= 30) activity.month++;
		else activity.older++;
	}
	return activity;
}

/** Team managers can't remove themselves, so the acting one always remains. */
export async function removeMember(db: D1Database, teamId: string, actorId: number, memberId: number, now: Date): Promise<Member> {
	if (actorId === memberId) throw conflict("You can't remove yourself.");
	const member = await listedMember(db, teamId, memberId);
	await markMemberRemoved(db, teamId, memberId, now.toISOString());
	return member;
}

/** The team's people waiting to sign in (too many codes, or wrong codes) and until when, `tomorrow` if it's after today
 * (a day's wait): Manage team's Waiting to sign in. */
export async function waitingToSignIn(db: D1Database, members: Member[], now: Date): Promise<Waiting[]> {
	const held = new Map((await heldEmails(db, now.toISOString())).map((h) => [h.email, h.until]));
	return members.flatMap((member) => {
		const until = held.get(member.email.toLowerCase());
		return until ? [{ member, until, tomorrow: localDate(new Date(until)) > localDate(now) }] : [];
	});
}

export interface Waiting { member: Member; until: string; tomorrow: boolean }

/** Let them sign in: ends the wait for someone on this team, so they can ask for a code now. */
export async function letSignIn(db: D1Database, teamId: string, memberId: number, now: Date): Promise<Member> {
	const member = await listedMember(db, teamId, memberId);
	await releaseHold(db, member.email, now.toISOString());
	return member;
}
