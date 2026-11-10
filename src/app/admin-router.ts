// The admin area's routes: /admin/..., for site admins only, with no team. The same
// path matching as the team router (router.ts).
import type { Viewer } from "../auth/viewer.ts";
import type { AdminNav } from "../features/admin/admin-nav-repository.ts";
import type { Team } from "../features/teams/team.ts";
import type { AppDeps } from "./deps.ts";
import { matchParts, split } from "./router.ts";

/** What every admin page's frame shows: who's asking, their current team (the way back to it), and
 * the navigation's counts. Made once a request, in handle-request.ts. */
export interface AdminFrame { viewer: Viewer; team: Team | null; nav: AdminNav }

export interface AdminCtx {
	req: Request;
	url: URL;
	params: Record<string, string>;
	viewer: Viewer;
	/** The admin's current team, if any (the bar's way back to it). */
	team: Team | null;
	frame: AdminFrame;
	deps: AppDeps;
}

export type AdminHandler = (ctx: AdminCtx) => Promise<Response>;

interface AdminRoute { method: string; parts: string[]; handler: AdminHandler; confirm: boolean }

export class AdminRouter {
	private readonly routes: AdminRoute[] = [];

	get(path: string, handler: AdminHandler): void {
		this.routes.push({ method: "GET", parts: split(path), handler, confirm: false });
	}

	/** `confirm`: a delete or remove, which needs the "are you sure" form's confirm=yes. */
	post(path: string, handler: AdminHandler, o: { confirm?: boolean } = {}): void {
		this.routes.push({ method: "POST", parts: split(path), handler, confirm: o.confirm ?? false });
	}

	match(method: string, pathname: string): { handler: AdminHandler; params: Record<string, string>; confirm: boolean } | null {
		const wanted = method === "HEAD" ? "GET" : method;
		for (const route of this.routes) {
			if (route.method !== wanted) continue;
			const params = matchParts(route.parts, split(pathname));
			if (params) return { handler: route.handler, params, confirm: route.confirm };
		}
		return null;
	}

	list(): Array<{ method: string; path: string; confirm: boolean }> {
		return this.routes.map((r) => ({ method: r.method, path: `/${r.parts.join("/")}`, confirm: r.confirm }));
	}
}
