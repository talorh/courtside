import type { Authenticate } from "../auth/session.ts";
import { signInRoutes } from "../features/signin/signin-routes.ts";
import { isSignInPage } from "../features/signin/signin-paths.ts";
import { isOpenFile, isStaticFile } from "./static-files.ts";
import { clubFile } from "./club-files.ts";
import { securityTxt } from "./security-txt.ts";
import { hasRole } from "../auth/permissions.ts";
import { loadViewer, type Viewer } from "../auth/viewer.ts";
import { touchLastSeen } from "../features/members/members-repository.ts";
import { playhqAlert } from "../features/games/playhq-alert.ts";
import { ALERTS_SLOT, fillSlots, LIVE_SLOT } from "../ui/page-slots.ts";
import { liveBar } from "../features/live/live-bar.ts";
import type { Team } from "../features/teams/team.ts";
import { launchPage } from "../ui/landing-pages.ts";
import { withStagingStrip } from "../ui/staging-strip.ts";
import type { AdminRouter } from "./admin-router.ts";
import { loadAdminNav } from "../features/admin/admin-nav-repository.ts";
import { viewAsPage } from "../features/admin/view-as.ts";
import { currentTeam, readTeamCookies } from "./current-team.ts";
import { afterwards, type AppDeps } from "./deps.ts";
import { requestDevice } from "../shared/device.ts";
import { forbidden, HttpError, notFound } from "./errors.ts";
import { isLaunch, noTeam, teamsPage } from "./landing.ts";
import { otherTeam } from "./other-team.ts";
import { contentSecurityPolicy, htmlResponse } from "./respond.ts";
import { failedResponse } from "./request-errors.ts";
import type { Router } from "./router.ts";
import { requireConfirm } from "../shared/validation.ts";
import { assertWritable, teamContext } from "./team-context.ts";
import { teamForWrite, writeTeam } from "./team-guard.ts";

export async function handleRequest(req: Request, deps: AppDeps, authenticate: Authenticate, router: Router, admin: AdminRouter): Promise<Response> {
	const url = new URL(req.url);
	const found: Found = { teamId: null, email: null, setCookies: [] };
	let response: Response;
	try {
		response = await respond(req, url, { ...deps, device: requestDevice(req) }, authenticate, router, admin, found);
	} catch (err) {
		response = await failedResponse(req, url, { ...deps, device: requestDevice(req) }, err, found);
	}
	if (deps.config.staging) response = await withStagingStrip(response);
	for (const cookie of found.setCookies) response.headers.append("Set-Cookie", cookie);
	// Every response's CSP; the launch screen's alone allows data: images and its own <style>, as its club logo and its
	// look are in the page (landing-pages.ts), and the sign-in pages' alone Turnstile.
	response.headers.set("Content-Security-Policy", contentSecurityPolicy(deps.config, { launch: isLaunch(req, url), turnstile: isSignInPage(url.pathname) }));
	return response;
}

/** What the request found out before anything failed: its team, who's asking, and cookies to put right. */
export interface Found { teamId: string | null; email: string | null; setCookies: string[] }

/** The request path (docs/architecture.md): who's asking, the site's own pages, then the current team's. */
async function respond(req: Request, url: URL, deps: AppDeps, authenticate: Authenticate, router: Router, admin: AdminRouter, found: Found): Promise<Response> {
	if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req, url);
	// Before anyone's signed in: the Home Screen app's spinner (so the app never shows a white screen), the sign-in's own
	// pages (features/signin) and the few files they need. Everything else, static files included, needs the session
	// (sign-in for everything); the Worker runs before the files (cloudflare.config.ts).
	if (isLaunch(req, url)) return htmlResponse(launchPage());
	// And security.txt, the one page anyone can read (app/security-txt.ts).
	const policy = securityTxt(req, url, deps.now());
	if (policy) return policy;
	// The club's colours and the Home Screen manifest, made from club.ts (app/club-files.ts): the sign-in page needs them too.
	const made = clubFile(req, url);
	if (made) return made;
	const open = await signInRoutes(req, url, deps);
	if (open) return open;
	if (isOpenFile(url.pathname)) return deps.assets.fetch(req);
	const email = await authenticate(req);
	found.email = email;
	if (isStaticFile(url.pathname)) return deps.assets.fetch(req);
	const viewer = await loadViewer(deps.db, email, deps.now());
	const cookies = readTeamCookies(req);
	const { team, setCookies } = await currentTeam(deps.db, viewer, cookies);
	// The admin area: site admins only; anyone else is told there's no such page. /changelog moved there.
	if (url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname === "/changelog") {
		if (!viewer.isAdmin) throw notFound("Page");
		found.setCookies = setCookies;
		return adminPage(req, url, deps, viewer, typeof team === "string" ? null : team, admin);
	}
	// Which team? and switching set their own cookies: putting the old one right after them would undo a switch.
	const site = await teamsPage(req, url, deps, viewer, typeof team === "string" ? null : team)
		?? await viewAsPage(req, url, deps, viewer, typeof team === "string" ? null : team);
	if (site) return site;
	found.setCookies = setCookies;
	// Someone on no team's list is told so, whatever they sent.
	if (team === "none" && !viewer.isAdmin) return noTeam(team, viewer, req, url);
	// Every write says which team its page was for, and runs as that team or is refused before anything happens.
	const isWrite = req.method !== "GET" && req.method !== "HEAD";
	const requestTeam = isWrite ? await teamForWrite(deps.db, viewer, team, await writeTeam(req)) : team;
	if (typeof requestTeam === "string") return noTeam(requestTeam, viewer, req, url);
	found.teamId = requestTeam.id;
	return teamPage(req, url, deps, viewer, requestTeam, router, cookies.viewAs ?? null);
}

async function teamPage(req: Request, url: URL, appDeps: AppDeps, viewer: Viewer, team: Team, router: Router, viewAs: string | null): Promise<Response> {
	const ctx = await teamContext(appDeps, viewer, team, viewAs);
	// currentTeam only gives a team the viewer can open, so this is a race (removed a moment ago): no such page for them.
	if (!ctx) throw notFound("Page");
	const { member, deps } = ctx;
	const match = router.match(req.method, url.pathname);
	if (!match) throw notFound("Page");
	if (!hasRole(member.role, match.minRole)) throw forbidden();
	assertWritable(team, req.method, match.closedTeams);
	if (match.confirm) await requireConfirm(req);
	// The live bar and a team manager's banner (PlayHQ) are worked out while the page is built, not after (only GETs ask).
	const alert = req.method === "GET" ? playhqAlert(deps, member) : Promise.resolve("" as const);
	const live = req.method === "GET" ? liveBar(deps, url.pathname) : Promise.resolve("" as const);
	const frame = { team, member, viewer, viewAs: ctx.viewAs };
	const response = await match.handler({ req, url, params: match.params, ...frame, frame, deps }).catch(async (err: unknown) => {
		// Not in this team: maybe in another of the viewer's, which a link (a WhatsApp message, say) can't know.
		const elsewhere = isNotFound(err) && (req.method === "GET" || req.method === "HEAD") ? await otherTeam(appDeps.db, viewer, team, url) : null;
		if (elsewhere) return elsewhere;
		throw err;
	});
	// Non-fatal: "last seen" is a nicety, and the request has already done its job (say, saved an upload), so a
	// database hiccup here mustn't turn that into an error page or a retry that's refused. Logged instead, and finished
	// after the response has gone. Never for an admin's hidden membership: the team's Manage team page doesn't list it.
	if (!member.hidden) {
		await afterwards(deps, touchLastSeen(deps.db, team.id, member.id, deps.now()).catch((err: unknown) =>
			console.error(JSON.stringify({ event: "last_seen_failed", teamId: team.id, memberId: member.id, error: String(err) }))));
	}
	return await fillSlots(req, response, member.role === "manager" ? [[LIVE_SLOT, live], [ALERTS_SLOT, alert]] : [[LIVE_SLOT, live]]);
}

const isNotFound = (err: unknown) => err instanceof HttpError && err.status === 404;

async function adminPage(req: Request, url: URL, deps: AppDeps, viewer: Viewer, team: Team | null, admin: AdminRouter): Promise<Response> {
	const match = admin.match(req.method, url.pathname);
	if (!match) throw notFound("Page");
	if (match.confirm) await requireConfirm(req);
	const frame = { viewer, team, nav: await loadAdminNav(deps.db) };
	return match.handler({ req, url, params: match.params, viewer, team, frame, deps });
}

// Forms and the upload API are same-origin only; this blocks cross-site form posts riding the session cookie.
function assertSameOrigin(req: Request, url: URL): void {
	if (req.headers.get("Origin") !== url.origin) throw forbidden("Cross-site request blocked.");
}
