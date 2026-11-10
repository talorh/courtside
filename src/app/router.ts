import type { Role } from "../auth/permissions.ts";
import type { Viewer } from "../auth/viewer.ts";
import type { Member } from "../features/members/members-repository.ts";
import type { Team } from "../features/teams/team.ts";
import type { PageFrame } from "../ui/layout.ts";
import type { TeamDeps } from "./deps.ts";

export interface RequestCtx {
	req: Request;
	url: URL;
	params: Record<string, string>;
	/** The current team: the one this request is for. */
	team: Team;
	/** The membership acted as: the viewer's own in this team, or an admin's hidden one. */
	member: Member;
	viewer: Viewer;
	/** The role an admin is viewing the team as, or null. */
	viewAs: Role | null;
	/** What the page's layout shows from all this: a route hands it to its view. */
	frame: PageFrame;
	deps: TeamDeps;
}

export type Handler = (ctx: RequestCtx) => Promise<Response>;

/** closedTeams: the write is allowed once a team's season is over (removal requests, deletes).
 * confirm: a delete or remove, which needs the "are you sure" form's confirm=yes (ui/confirm.ts). */
export interface RouteOptions { closedTeams?: boolean; confirm?: boolean }

interface Route {
	method: string;
	parts: string[];
	minRole: Role;
	handler: Handler;
	closedTeams: boolean;
	confirm: boolean;
}

export interface RouteMatch {
	minRole: Role;
	handler: Handler;
	params: Record<string, string>;
	closedTeams: boolean;
	confirm: boolean;
}

export const split = (path: string) => path.split("/").filter(Boolean);

// A badly encoded segment (e.g. "%E0%A4%A") can't be a real id; treat it as "no such page" rather than a 500.
function decode(segment: string): string | null {
	try {
		return decodeURIComponent(segment);
	} catch (err) {
		if (err instanceof URIError) return null;
		throw err;
	}
}

export function matchParts(pattern: string[], segments: string[]): Record<string, string> | null {
	if (pattern.length !== segments.length) return null;
	const params: Record<string, string> = {};
	for (const [i, part] of pattern.entries()) {
		const segment = segments[i] ?? "";
		if (part.startsWith(":")) {
			const value = decode(segment);
			if (value === null) return null;
			params[part.slice(1)] = value;
		} else if (part !== segment) return null;
	}
	return params;
}

export class Router {
	private readonly routes: Route[] = [];

	get(path: string, minRole: Role, handler: Handler): void {
		this.routes.push({ method: "GET", parts: split(path), minRole, handler, closedTeams: true, confirm: false });
	}

	post(path: string, minRole: Role, handler: Handler, o: RouteOptions = {}): void {
		// A delete or remove (it asks first) is always allowed once a season's over: tidying up is still the team manager's.
		this.routes.push({ method: "POST", parts: split(path), minRole, handler, closedTeams: o.closedTeams ?? o.confirm ?? false, confirm: o.confirm ?? false });
	}

	/** Every route, for the isolation suite (tests/isolation), which must cover each one. */
	list(): Array<{ method: string; path: string; minRole: Role; closedTeams: boolean; confirm: boolean }> {
		return this.routes.map((r) => ({ method: r.method, path: `/${r.parts.join("/")}`, minRole: r.minRole, closedTeams: r.closedTeams, confirm: r.confirm }));
	}

	match(method: string, pathname: string): RouteMatch | null {
		const wanted = method === "HEAD" ? "GET" : method;
		const segments = split(pathname);
		for (const route of this.routes) {
			if (route.method !== wanted) continue;
			const params = matchParts(route.parts, segments);
			if (params) return { minRole: route.minRole, handler: route.handler, params, closedTeams: route.closedTeams, confirm: route.confirm };
		}
		return null;
	}
}
