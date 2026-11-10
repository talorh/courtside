// View as (an admin sees what another role sees, to check things and troubleshoot): an admin
// tries a team as Watch only, Watch and film or a coach. A browser-session cookie names the team and the role, so it ends
// with the session and only ever counts for the team it names. What's done meanwhile is recorded as the admin's own.
import { z } from "zod";
import { clearedCookie, VIEW_AS_COOKIE, viewAsCookie, withCookies } from "../../app/current-team.ts";
import type { AppDeps } from "../../app/deps.ts";
import { badRequest, notFound } from "../../app/errors.ts";
import { sitePath, switchCookies } from "../../app/landing.ts";
import { redirect } from "../../app/respond.ts";
import { isRole, ROLE_LABELS, type Role } from "../../auth/permissions.ts";
import type { Viewer } from "../../auth/viewer.ts";
import { parseForm } from "../../shared/validation.ts";
import type { Team } from "../teams/team.ts";
import { adminLogStatement } from "./admin-log-repository.ts";

/** The roles an admin can view a team as. Team manager too (another team's team
 * manager): what an admin opening a team they're not in gets anyway, but chosen by name, with the strip saying so. */
export const VIEWABLE: Role[] = ["watcher", "filmer", "coach", "manager"];

/** The role an admin views `team` as: their cookie's, when it names this team. Anyone else's cookie counts for nothing. */
export function viewingAs(viewer: Viewer, team: Team, cookie: string | null | undefined): Role | null {
	if (!viewer.isAdmin || !cookie) return null;
	const at = cookie.lastIndexOf(":");
	const role = cookie.slice(at + 1);
	return at > 0 && cookie.slice(0, at) === team.id && isRole(role) && VIEWABLE.includes(role) ? role : null;
}

const Start = z.object({ team: z.string().max(64).optional(), role: z.string().max(20), next: z.string().max(2000).optional() });
const Stop = z.object({ next: z.string().max(2000).optional() });

/** POST /view-as (from the Teams page, with the team, or a team's own page) and POST /view-as/stop; null for any other
 * address. Admins only: to anyone else there's no such page. */
export async function viewAsPage(req: Request, url: URL, deps: AppDeps, viewer: Viewer, current: Team | null): Promise<Response | null> {
	if (url.pathname !== "/view-as" && url.pathname !== "/view-as/stop") return null;
	if (req.method !== "POST" || !viewer.isAdmin) throw notFound("Page");
	const log = (teamId: string | null, detail: string) =>
		adminLogStatement(deps.db, { device: deps.device, adminEmail: viewer.email, teamId, action: "view_as", detail, at: deps.now().toISOString() }).run();
	if (url.pathname === "/view-as/stop") {
		const { next } = await parseForm(req, Stop);
		await log(current?.id ?? null, "stopped");
		return withCookies(redirect(sitePath(next)), [clearedCookie(VIEW_AS_COOKIE)]);
	}
	const { team, role } = await parseForm(req, Start);
	if (!isRole(role) || !VIEWABLE.includes(role)) throw badRequest("Choose Watch only, Watch and film, Coach or Team manager.");
	const teamId = team ?? current?.id;
	if (!teamId) throw badRequest("Open a team first.");
	const cookies = teamId === current?.id ? [] : await switchCookies(deps, viewer, teamId);
	await log(teamId, ROLE_LABELS[role]);
	return withCookies(redirect("/"), [...cookies, viewAsCookie(teamId, role)]);
}
