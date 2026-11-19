// The admin area's Users page: everyone on every team, with its dashboard and filters; locking, unlocking, taking
// someone off a team and adding someone to one. A refused change (the last team manager, say) shows the page again
// with why.
import { z } from "zod";
import type { AdminFrame, AdminRouter } from "../../app/admin-router.ts";
import type { AppDeps } from "../../app/deps.ts";
import { HttpError } from "../../app/errors.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import { listLocks } from "../../auth/locks-repository.ts";
import { ROLES } from "../../auth/permissions.ts";
import { doneMessage, parseForm } from "../../shared/validation.ts";
import { listTeamsIn } from "../teams/teams-repository.ts";
import { filterUsers, parseUserFilters } from "./users-filter.ts";
import { listUserRows } from "./users-repository.ts";
import { addToTeam, lockPerson, removeFromTeam, unlockPerson } from "./users-service.ts";
import { summariseUsers } from "./users-summary.ts";
import { USERS_MESSAGES, type UsersPage, usersPage } from "./views/users-page.ts";

const AddForm = z.object({ email: z.string().max(254), name: z.string().max(80).default(""), team: z.string().max(80), role: z.enum(ROLES) });
const EmailForm = z.object({ email: z.string().max(254) });
const RemoveForm = z.object({ team: z.string().max(80), member: z.coerce.number().int().positive() });

async function page(deps: AppDeps, frame: AdminFrame, you: string, url: URL, extra: Partial<UsersPage> = {}, status = 200): Promise<Response> {
	const now = deps.now();
	const [rows, locks, teams] = await Promise.all([listUserRows(deps.db), listLocks(deps.db), listTeamsIn(deps.db, ["active", "closed"])]);
	const filters = parseUserFilters(url);
	const onTeams = new Set(rows.map((r) => r.email));
	return htmlResponse(usersPage({
		frame, now, you, rows, filters, teams, shown: filterUsers(rows, filters, now), summary: summariseUsers(rows, locks.map((l) => l.email), now),
		strays: locks.filter((l) => !onTeams.has(l.email.toLowerCase())), message: doneMessage(USERS_MESSAGES, url), ...extra,
	}), status);
}

/** The change, then back to the page with what it did (`done`, or what the change says); refused, the page again with
 * why. */
async function act(deps: AppDeps, frame: AdminFrame, you: string, url: URL, change: () => Promise<unknown>, done: string, extra: Partial<UsersPage> = {}): Promise<Response> {
	try {
		const said = await change();
		return redirect(`/admin/users?done=${typeof said === "object" && said !== null && "locked" in said && said.locked ? `${done}-locked` : done}`);
	} catch (err) {
		if (!(err instanceof HttpError) || err.status >= 500) throw err;
		return page(deps, frame, you, new URL("/admin/users", url), { ...extra, error: err.message }, err.status);
	}
}

export function usersRoutes(router: AdminRouter): void {
	router.get("/admin/users", async ({ deps, frame, viewer, url }) => page(deps, frame, viewer.email, url));

	router.post("/admin/users", async ({ req, deps, frame, viewer, url }) => {
		const f = await parseForm(req, AddForm);
		return act(deps, frame, viewer.email, url, () => addToTeam(deps, viewer.email, { email: f.email, name: f.name, teamId: f.team, role: f.role }), "added",
			{ values: { email: f.email, name: f.name, teamId: f.team, role: f.role } });
	});

	router.post("/admin/users/lock", async ({ req, deps, frame, viewer, url }) => {
		const { email } = await parseForm(req, EmailForm);
		return act(deps, frame, viewer.email, url, () => lockPerson(deps, viewer.email, email), "locked");
	}, { confirm: true });

	router.post("/admin/users/unlock", async ({ req, deps, frame, viewer, url }) => {
		const { email } = await parseForm(req, EmailForm);
		return act(deps, frame, viewer.email, url, () => unlockPerson(deps, viewer.email, email), "unlocked");
	}, { confirm: true });

	router.post("/admin/users/remove", async ({ req, deps, frame, viewer, url }) => {
		const f = await parseForm(req, RemoveForm);
		return act(deps, frame, viewer.email, url, () => removeFromTeam(deps, viewer.email, f.team, f.member), "removed");
	}, { confirm: true });
}
