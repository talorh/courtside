// The Users page's dashboard: how many people, how many use the site, who hasn't signed in yet, who's locked, who's on
// more than one team, and each team's people and roles. People are counted once, by email, whatever their teams.
import { ROLES, type Role } from "../../auth/permissions.ts";
import type { UserRow } from "./users-repository.ts";

export interface TeamCount { teamId: string; code: string; seasonStart: number; running: boolean; people: number; active: number; never: number; managers: number }

export interface UsersSummary {
	people: number; week: number; month: number; never: number; locked: number; multi: number; admins: number;
	roles: Record<Role, number>; teams: TeamCount[];
}

const DAY_MS = 86_400_000;
const within = (iso: string | null, days: number, now: Date) => iso !== null && now.getTime() - Date.parse(iso) <= days * DAY_MS;
const newest = (a: string | null, b: string | null) => (a && (!b || a > b) ? a : b);

/** `locked`: every locked email, on a team or not. Teams: running ones first, then by code and the newest season. */
export function summariseUsers(rows: UserRow[], locked: string[], now: Date): UsersSummary {
	const people = new Map<string, { seen: string | null; teams: number; admin: boolean }>();
	const teams = new Map<string, TeamCount>();
	const roles = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
	for (const r of rows) {
		const p = people.get(r.email) ?? { seen: null, teams: 0, admin: r.isAdmin };
		people.set(r.email, { seen: newest(r.lastSeenAt, p.seen), teams: p.teams + 1, admin: p.admin });
		roles[r.role]++;
		const t = teams.get(r.teamId) ?? { teamId: r.teamId, code: r.code, seasonStart: r.seasonStart, running: r.teamStatus === "active", people: 0, active: 0, never: 0, managers: 0 };
		t.people++;
		if (within(r.lastSeenAt, 30, now)) t.active++;
		if (r.lastSeenAt === null) t.never++;
		if (r.role === "manager") t.managers++;
		teams.set(r.teamId, t);
	}
	const all = [...people.values()];
	return {
		people: people.size, week: all.filter((p) => within(p.seen, 7, now)).length, month: all.filter((p) => within(p.seen, 30, now)).length,
		never: all.filter((p) => p.seen === null).length, locked: locked.length, multi: all.filter((p) => p.teams > 1).length,
		admins: all.filter((p) => p.admin).length, roles,
		teams: [...teams.values()].sort((a, b) => Number(b.running) - Number(a.running) || a.code.localeCompare(b.code) || b.seasonStart - a.seasonStart),
	};
}
