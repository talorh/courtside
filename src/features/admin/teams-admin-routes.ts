// The admin area's Teams pages: the list, onboarding a team and its team manager's welcome email.
import { z } from "zod";
import type { AdminRouter } from "../../app/admin-router.ts";
import { HttpError, notFound } from "../../app/errors.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import { doneMessage, parseForm } from "../../shared/validation.ts";
import { listActiveMembers } from "../members/members-repository.ts";
import { countPeopleOnTeams, getTeam, listTeamSummaries } from "../teams/teams-repository.ts";
import { onboardSeasons, onboardTeam } from "./teams-admin-service.ts";
import { emailWelcome } from "./welcome-service.ts";
import { onboardPage, welcomePage } from "./views/onboard-page.ts";
import { TEAMS_MESSAGES, teamsListPage } from "./views/teams-page.ts";

// As long as the form's fields allow (maxlength), so a browser never gets "Please check the form" instead of the form.
const OnboardForm = z.object({
	code: z.string().max(20), season: z.string().max(4), managerName: z.string().max(80), managerEmail: z.string().max(254), askName: z.string().max(30).default(""),
});
const BLANK = { code: "", season: "", managerName: "", managerEmail: "", askName: "" };

export function teamsAdminRoutes(router: AdminRouter): void {
	router.get("/admin/teams", async ({ deps, frame, url }) => {
		const [teams, people] = await Promise.all([listTeamSummaries(deps.db), countPeopleOnTeams(deps.db)]);
		const message = doneMessage(TEAMS_MESSAGES, url);
		return htmlResponse(teamsListPage({ frame, teams, people, now: deps.now(), message }));
	});

	router.get("/admin/teams/new", async ({ deps, frame }) =>
		htmlResponse(onboardPage({ frame, seasons: onboardSeasons(deps.now()), values: BLANK })));

	// Refused (a code an open team has, say): the form again, as typed, with why.
	router.post("/admin/teams", async ({ req, url, deps, viewer, frame }) => {
		const values = await parseForm(req, OnboardForm);
		try {
			const made = await onboardTeam(deps, viewer.email, values);
			// Then its team manager's welcome: the team stands whether or not it goes (the page says which).
			return redirect(`/admin/teams/${made.id}/welcome?emailed=${await emailWelcome(deps, made, viewer.email, url.origin)}`);
		} catch (err) {
			if (!(err instanceof HttpError) || err.status >= 500) throw err;
			return htmlResponse(onboardPage({ frame, seasons: onboardSeasons(deps.now()), values, error: err.message }), err.status);
		}
	});

	router.get("/admin/teams/:id/welcome", async ({ deps, frame, params, url }) => {
		const shown = await getTeam(deps.db, params.id ?? "");
		if (!shown || shown.status === "deleted") throw notFound("Team");
		const manager = (await listActiveMembers(deps.db, shown.id)).find((m) => m.role === "manager") ?? null;
		const emailed = url.searchParams.get("emailed");
		return htmlResponse(welcomePage({
			frame, team: shown, manager, origin: url.origin, staging: deps.config.staging, emailed: emailed === "sent" || emailed === "failed" ? emailed : null,
		}));
	});

	// The welcome again: it didn't go, or the team manager has lost it.
	router.post("/admin/teams/:id/welcome", async ({ deps, viewer, params, url }) => {
		const shown = await getTeam(deps.db, params.id ?? "");
		if (!shown || shown.status === "deleted") throw notFound("Team");
		return redirect(`/admin/teams/${shown.id}/welcome?emailed=${await emailWelcome(deps, shown, viewer.email, url.origin)}`);
	});
}
