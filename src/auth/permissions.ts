export const ROLES = ["watcher", "filmer", "coach", "manager"] as const;
export type Role = (typeof ROLES)[number];

// Coach: films too (a parent may well use the coach's phone), adds photos and writes the coaches' notes. Team
// manager: also the fixture, the roster, members and videos (only team managers change those).
export const ROLE_LABELS: Record<Role, string> = { watcher: "Watch only", filmer: "Watch and film", coach: "Coach", manager: "Team manager" };

const RANK: Record<Role, number> = { watcher: 0, filmer: 1, coach: 2, manager: 3 };

export function hasRole(actual: Role, required: Role): boolean {
	return RANK[actual] >= RANK[required];
}

export function isRole(value: unknown): value is Role {
	return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Who films games (Upload video and Go live): everyone but Watch only. */
export const films = (role: Role): boolean => role !== "watcher";

/** Who can ask the site's admin (Support, and the link at the bottom of Help): team managers only. The routes say
 * "manager" as their least role, which is the same. */
export const asksAdmin = (role: Role): boolean => hasRole(role, "manager");
