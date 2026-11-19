// The Users page's filters and order, from its address (?team=&role=&status=&q=&sort=&dir=): anything it doesn't know
// is the usual (everyone, by name), so a typed address never fails. Each row is one person's place on one team.
import { z } from "zod";
import { ROLES } from "../../auth/permissions.ts";
import type { UserRow } from "./users-repository.ts";

export const USER_STATUSES = {
	week: "Used it this week", active: "Used it this month", quiet: "Not this month", never: "Not signed in yet", multi: "On more than one team",
	locked: "Locked", admin: "Site admins",
} as const;
export type UserStatus = keyof typeof USER_STATUSES;
export const USER_SORTS = ["name", "email", "team", "role", "seen"] as const;
export type UserSort = (typeof USER_SORTS)[number];

const Filters = z.object({
	team: z.string().max(80).catch(""),
	role: z.enum(ROLES).or(z.literal("")).catch(""),
	status: z.enum(Object.keys(USER_STATUSES) as [UserStatus, ...UserStatus[]]).or(z.literal("")).catch(""),
	q: z.string().max(100).catch(""),
	sort: z.enum(USER_SORTS).catch("name"),
	dir: z.enum(["asc", "desc"]).catch("asc"),
});
export type UserFilters = z.infer<typeof Filters>;

export const parseUserFilters = (url: URL): UserFilters => Filters.parse({
	team: url.searchParams.get("team") ?? "", role: url.searchParams.get("role") ?? "", status: url.searchParams.get("status") ?? "",
	q: (url.searchParams.get("q") ?? "").trim(), sort: url.searchParams.get("sort") ?? "name", dir: url.searchParams.get("dir") ?? "asc",
});

/** The page's address for these filters, leaving out what's the usual. */
export function usersHref(f: UserFilters): string {
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(f)) if (v && !(k === "sort" && v === "name") && !(k === "dir" && v === "asc")) q.set(k, v);
	const s = q.toString();
	return s ? `/admin/users?${s}` : "/admin/users";
}

const DAY_MS = 86_400_000;
const seenWithin = (r: UserRow, now: Date, days = 30) => r.lastSeenAt !== null && now.getTime() - Date.parse(r.lastSeenAt) <= days * DAY_MS;

/** `multi`: the emails on more than one team; `seen`: those that have opened any team. */
function matches(r: UserRow, f: UserFilters, now: Date, multi: Set<string>, seen: Set<string>): boolean {
	if (f.team && r.teamId !== f.team) return false;
	if (f.role && r.role !== f.role) return false;
	if (f.status === "week" && !seenWithin(r, now, 7)) return false;
	if (f.status === "active" && !seenWithin(r, now)) return false;
	if (f.status === "multi" && !multi.has(r.email)) return false;
	if (f.status === "quiet" && (r.lastSeenAt === null || seenWithin(r, now))) return false;
	if (f.status === "never" && seen.has(r.email)) return false;
	if (f.status === "locked" && !r.locked) return false;
	if (f.status === "admin" && !r.isAdmin) return false;
	const q = f.q.toLowerCase();
	return !q || r.email.includes(q) || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
}

const ROLE_ORDER: Record<UserRow["role"], number> = { manager: 0, coach: 1, filmer: 2, watcher: 3 };
const KEYS: Record<UserSort, (r: UserRow) => string | number> = {
	name: (r) => (r.name || r.email).toLowerCase(), email: (r) => r.email, team: (r) => `${r.code} ${9999 - r.seasonStart}`,
	role: (r) => ROLE_ORDER[r.role], seen: (r) => (r.lastSeenAt ? Date.parse(r.lastSeenAt) : 0),
};

/** The rows the filters keep, in their order; ties by name, then team, so the order never jumps between loads. Last
 * seen sorts newest first unless asked otherwise, and never signed in comes last that way. */
export function filterUsers(rows: UserRow[], f: UserFilters, now: Date): UserRow[] {
	const key = KEYS[f.sort], sign = (f.dir === "desc" ? -1 : 1) * (f.sort === "seen" ? -1 : 1);
	const by = (a: UserRow, b: UserRow) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; };
	const text = (k: UserSort, r: UserRow) => String(KEYS[k](r));
	const tie = (a: UserRow, b: UserRow) => text("name", a).localeCompare(text("name", b)) || text("team", a).localeCompare(text("team", b));
	const teams = new Map<string, number>();
	for (const r of rows) teams.set(r.email, (teams.get(r.email) ?? 0) + 1);
	const multi = new Set([...teams].filter(([, n]) => n > 1).map(([email]) => email));
	const seen = new Set(rows.filter((r) => r.lastSeenAt !== null).map((r) => r.email));
	return rows.filter((r) => matches(r, f, now, multi, seen)).sort((a, b) => by(a, b) * sign || tie(a, b));
}
