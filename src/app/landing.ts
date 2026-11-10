// Where someone without a current team lands, and the site's pages that are no team's own: Which team? and switching
// team (same addresses, the site remembers your team).
import { z } from "zod";
import type { Viewer } from "../auth/viewer.ts";
import type { Team } from "../features/teams/team.ts";
import { listTeams } from "../features/teams/teams-repository.ts";
import { parseForm } from "../shared/validation.ts";
import { notOnTeamPage, whichTeamPage } from "../ui/landing-pages.ts";
import { ADMIN_TEAM_COOKIE, adminCanOpen, adminTeamCookie, clearedCookie, teamCookie, withCookies } from "./current-team.ts";
import type { AppDeps } from "./deps.ts";
import { HttpError, notFound } from "./errors.ts";
import { htmlResponse, redirect } from "./respond.ts";

const isRead = (req: Request) => req.method === "GET" || req.method === "HEAD";

/** `next` when it's a page on this site ("/games/12?tab=clips", "/manage#removals"), else Home, so a link can't send
 * anyone off the site: not another origin, and not a path that starts "//" ("/..//evil.test" parses to one), which a
 * browser given it as a Location would take for another site. */
export function sitePath(next: string | null | undefined): string {
	if (!next?.startsWith("/")) return "/";
	const url = new URL(next, "https://site.invalid"); // any base: only the path is kept
	if (url.origin !== "https://site.invalid" || url.pathname.startsWith("//") || url.pathname.startsWith("/teams")) return "/";
	return url.pathname + url.search + url.hash;
}

/** A fresh open of the site: the Home Screen app's start address (`/?app`), or a navigation the person started
 * themselves (an older icon, the address typed: what iPhones were seen to send, never with Sec-Fetch-User). */
export const isLaunch = (req: Request, url: URL) => req.method === "GET" && url.pathname === "/"
	&& (url.searchParams.has("app") || (req.headers.get("Sec-Fetch-Site") === "none" && req.headers.get("Sec-Fetch-Mode") === "navigate"));

/** No current team: Which team? for someone in several, the admin area for an admin in none, else the not-on-a-team page. */
export function noTeam(team: "choose" | "none", viewer: Viewer, req: Request, url: URL): Response {
	if (team === "none") return viewer.isAdmin ? redirect("/admin", 302) : htmlResponse(notOnTeamPage(viewer.email), 403);
	if (!isRead(req) || url.pathname.startsWith("/api/")) throw new HttpError(409, "choose_team", "Choose your team first: reload the page.");
	return redirect(`/teams?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
}

/** /teams (Which team?) and POST /teams/switch; null for any other address. */
export async function teamsPage(req: Request, url: URL, deps: AppDeps, viewer: Viewer, current: Team | null): Promise<Response | null> {
	if (url.pathname === "/teams" && isRead(req)) return whichTeam(url, deps, viewer, current);
	if (url.pathname === "/teams/switch" && req.method === "POST") return switchTeam(req, deps, viewer);
	return null;
}

async function whichTeam(url: URL, deps: AppDeps, viewer: Viewer, current: Team | null): Promise<Response> {
	const own = viewer.memberships.filter((m) => !m.member.hidden).map((m) => m.team);
	if (!own.length && !viewer.isAdmin) return htmlResponse(notOnTeamPage(viewer.email), 403);
	const others = viewer.isAdmin ? (await listTeams(deps.db)).filter((t) => !own.some((o) => o.id === t.id)) : [];
	const next = sitePath(url.searchParams.get("next"));
	// One team to choose: nothing to ask, so it opens, at the page they wanted.
	const [only, ...more] = [...own, ...others];
	if (only && !more.length) return withCookies(redirect(next, 302), await switchCookies(deps, viewer, only.id));
	return htmlResponse(whichTeamPage({ current, own, others, next }));
}

const SwitchForm = z.object({ team: z.string().min(1).max(64), next: z.string().max(2000).optional() });

/** The cookies that make `team` the person's team: one they're in, for a year; one an admin isn't in, their visit for
 * this browser session (`admin_team`). Anything else is "not found", whether it exists or not. */
export async function switchCookies(deps: AppDeps, viewer: Viewer, team: string): Promise<string[]> {
	if (viewer.memberships.some((m) => m.team.id === team && !m.member.hidden)) return [teamCookie(team), clearedCookie(ADMIN_TEAM_COOKIE)];
	if (viewer.isAdmin && await adminCanOpen(deps.db, viewer, team)) return [adminTeamCookie(team)];
	throw notFound("Team");
}

async function switchTeam(req: Request, deps: AppDeps, viewer: Viewer): Promise<Response> {
	const { team, next } = await parseForm(req, SwitchForm);
	return withCookies(redirect(sitePath(next)), await switchCookies(deps, viewer, team));
}
