import { handleRequest } from "../../src/app/handle-request.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import type { Router } from "../../src/app/router.ts";
import { buildRouter } from "../../src/app/routes.ts";
import type { TestDeps } from "./fakes.ts";

export const ORIGIN = "https://saints.example";
export const MANAGER = "sam@saints.example";

/** Who's asking: their email, and the `team` and `admin_team` cookies their browser sends (`team` defaults to the
 * deps' team; null sends none). `writeTeam`: the team their writes say they're for, as the site's pages do (`_team`
 * in a form, else X-Courtside-Team); by default the team they're on; null says none, like a page from before multi-team. */
export interface ClientOptions { email?: string; team?: string | null; adminTeam?: string | null; writeTeam?: string | null; viewAs?: string }

/** `init` as a page of `team` would send it: a form gets `_team` (unless it has one), anything else the header. */
function sayTeam(init: RequestInit, team: string): RequestInit {
	if (init.body instanceof URLSearchParams) {
		const body = new URLSearchParams(init.body);
		if (!body.has("_team")) body.append("_team", team);
		return { ...init, body };
	}
	if (init.body instanceof FormData) {
		const body = new FormData();
		for (const [key, value] of init.body) body.append(key, value);
		if (!body.has("_team")) body.append("_team", team);
		return { ...init, body };
	}
	return { ...init, headers: { "X-Courtside-Team": team, ...init.headers } };
}

/** Calls the app like the Worker would, with a fixed signed-in email (or ClientOptions) and its team cookie. */
export function makeClient(deps: TestDeps, who: string | ClientOptions = MANAGER, router: Router = buildRouter()) {
	const o = typeof who === "string" ? { email: who } : who;
	const { email = MANAGER, team = deps.team.id, adminTeam = null } = o;
	const says = o.writeTeam === undefined ? adminTeam ?? team ?? deps.team.id : o.writeTeam;
	const cookie = [team && `team=${team}`, adminTeam && `admin_team=${adminTeam}`, o.viewAs && `viewas=${o.viewAs}`].filter(Boolean).join("; ");
	return (path: string, init: RequestInit = {}) => {
		const write = !["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase());
		const sent = write && says ? sayTeam(init, says) : init;
		return handleRequest(new Request(`${ORIGIN}${path}`, { ...sent, headers: { Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...sent.headers } }), deps, async () => email, router, buildAdminRouter());
	};
}

export const form = (data: Record<string, string>): RequestInit => ({ method: "POST", body: new URLSearchParams(data) });
/** Add families as the Roster's rows send it: a surname field a row ("Smith\nLee" is two rows). */
export const familiesForm = (rows: string): RequestInit => ({ method: "POST", body: new URLSearchParams(rows.split("\n").map((s) => ["surname", s])) });
export const jsonBody = (data: unknown): RequestInit => ({
	method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" },
});
