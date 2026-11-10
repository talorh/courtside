// The team a request is for. Addresses stay as they are, so the site remembers each
// person's current team in a cookie, `team`, for a year. An admin opening a team they aren't in gets `admin_team`
// instead, for that browser session only, so the next time they open the site it's their own team again.
import type { Viewer } from "../auth/viewer.ts";
import type { Team } from "../features/teams/team.ts";
import { getTeam } from "../features/teams/teams-repository.ts";

export const TEAM_COOKIE = "team";
export const ADMIN_TEAM_COOKIE = "admin_team";
/** View as (features/admin/view-as.ts): "<team id>:<role>", for the browser session. */
export const VIEW_AS_COOKIE = "viewas";

export interface TeamCookies { team: string | null; adminTeam: string | null; viewAs?: string | null }
/** The team, or "choose" (in several teams, none chosen yet) or "none" (on no team's list); and Set-Cookie values. */
export interface CurrentTeam { team: Team | "choose" | "none"; setCookies: string[] }

const ATTRIBUTES = "Path=/; Secure; HttpOnly; SameSite=Lax";
export const teamCookie = (teamId: string) => `${TEAM_COOKIE}=${teamId}; ${ATTRIBUTES}; Max-Age=31536000`;
export const adminTeamCookie = (teamId: string) => `${ADMIN_TEAM_COOKIE}=${teamId}; ${ATTRIBUTES}`;
export const viewAsCookie = (teamId: string, role: string) => `${VIEW_AS_COOKIE}=${teamId}:${role}; ${ATTRIBUTES}`;
export const clearedCookie = (name: string) => `${name}=; ${ATTRIBUTES}; Max-Age=0`;

export function readTeamCookies(req: Request): TeamCookies {
	const found: Record<string, string> = {};
	for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
		const at = part.indexOf("=");
		const name = part.slice(0, at).trim();
		if (at > 0 && (name === TEAM_COOKIE || name === ADMIN_TEAM_COOKIE || name === VIEW_AS_COOKIE)) found[name] = part.slice(at + 1).trim();
	}
	return { team: found[TEAM_COOKIE] || null, adminTeam: found[ADMIN_TEAM_COOKIE] || null, viewAs: found[VIEW_AS_COOKIE] || null };
}

/** `res` with these Set-Cookie values added. */
export function withCookies(res: Response, setCookies: string[]): Response {
	for (const cookie of setCookies) res.headers.append("Set-Cookie", cookie);
	return res;
}

/** A team an admin can open: any that isn't deleted. One they're in (hidden or not) costs no trip to the database. */
export async function adminCanOpen(db: D1Database, viewer: Viewer, teamId: string): Promise<Team | null> {
	const known = viewer.memberships.find((m) => m.team.id === teamId)?.team;
	const team = known ?? await getTeam(db, teamId);
	return team && team.status !== "deleted" ? team : null;
}

/**
 * `admin_team` when the viewer is an admin now; else `team` when it names a team they're really in (an admin's hidden
 * way into a team doesn't count); else their only team, or their only current one when the others' seasons are over;
 * else "choose" or "none". A cookie that's no use is cleared, and a team picked for them is remembered.
 */
export async function currentTeam(db: D1Database, viewer: Viewer, cookies: TeamCookies): Promise<CurrentTeam> {
	const setCookies: string[] = [];
	if (cookies.adminTeam) {
		const visiting = viewer.isAdmin ? await adminCanOpen(db, viewer, cookies.adminTeam) : null;
		if (visiting) return { team: visiting, setCookies };
		setCookies.push(clearedCookie(ADMIN_TEAM_COOKIE));
	}
	const own = viewer.memberships.filter((m) => !m.member.hidden);
	const chosen = own.find((m) => m.team.id === cookies.team);
	if (chosen) return { team: chosen.team, setCookies };
	const current = own.filter((m) => m.team.status === "active");
	const only = own.length === 1 ? own[0] : current.length === 1 ? current[0] : undefined;
	if (only) return { team: only.team, setCookies: [...setCookies, teamCookie(only.team.id)] };
	if (cookies.team) setCookies.push(clearedCookie(TEAM_COOKIE));
	return { team: own.length ? "choose" : "none", setCookies };
}
