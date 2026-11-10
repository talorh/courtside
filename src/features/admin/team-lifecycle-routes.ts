// The admin area's pages for one team: edit, close, reopen, and deleting it tonight or not.
import { z } from "zod";
import type { AdminCtx, AdminRouter } from "../../app/admin-router.ts";
import type { AppDeps } from "../../app/deps.ts";
import { HttpError, notFound } from "../../app/errors.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import { parseForm } from "../../shared/validation.ts";
import { hasGames } from "../games/games-repository.ts";
import type { Team } from "../teams/team.ts";
import { getTeam } from "../teams/teams-repository.ts";
import { cancelDelete, closeTeam, deleteTonight, editTeam, reopenTeam } from "./team-lifecycle-service.ts";
import { onboardSeasons } from "./teams-admin-service.ts";
import { closePage, deletePage, keepPage, reopenPage } from "./views/team-close-page.ts";
import { editPage } from "./views/team-edit-page.ts";

const EditForm = z.object({ code: z.string().max(20), season: z.string().max(4), askName: z.string().max(30).default("") });
const CloseForm = z.object({ when: z.enum(["due", "tonight"]).default("due"), confirmCode: z.string().max(20).default("") });
const DeleteForm = z.object({ confirmCode: z.string().max(20).default("") });

/** Any team that isn't deleted (an admin manages every team, whether they're in it or not). */
async function adminTeam(deps: AppDeps, id: string | undefined): Promise<Team> {
	const team = await getTeam(deps.db, id ?? "");
	if (!team || team.status === "deleted") throw notFound("Team");
	return team;
}

/** A refusal (anything but a failure) shows the form again with why; anything else is the usual error page. */
async function orAgain(work: () => Promise<void>, done: string, again: (error: string, status: number) => Promise<Response>): Promise<Response> {
	try {
		await work();
		return redirect(`/admin/teams?done=${done}`);
	} catch (err) {
		if (!(err instanceof HttpError) || err.status >= 500) throw err;
		return again(err.message, err.status);
	}
}

export function teamLifecycleRoutes(router: AdminRouter): void {
	const edit = async ({ deps, frame, params }: AdminCtx, values?: z.infer<typeof EditForm>, error?: string, status = 200) => {
		const shown = await adminTeam(deps, params.id);
		const page = editPage({ frame, team: shown, seasons: onboardSeasons(deps.now()), locked: await hasGames(deps.db, shown.id), values, error });
		return htmlResponse(page, status);
	};
	router.get("/admin/teams/:id/edit", (ctx) => edit(ctx));
	router.post("/admin/teams/:id", async (ctx) => {
		const values = await parseForm(ctx.req, EditForm);
		const shown = await adminTeam(ctx.deps, ctx.params.id);
		return orAgain(() => editTeam(ctx.deps, ctx.viewer.email, shown, values), "saved", (error, status) => edit(ctx, values, error, status));
	});

	router.get("/admin/teams/:id/close", async ({ deps, frame, params }) =>
		htmlResponse(closePage({ frame, team: await adminTeam(deps, params.id), now: deps.now() })));
	router.post("/admin/teams/:id/close", async ({ req, deps, viewer, frame, params }) => {
		const values = await parseForm(req, CloseForm);
		const shown = await adminTeam(deps, params.id);
		return orAgain(() => closeTeam(deps, viewer.email, shown, values), "closed",
			async (error, status) => htmlResponse(closePage({ frame, team: shown, now: deps.now(), values, error }), status));
	});

	router.get("/admin/teams/:id/reopen", async ({ deps, frame, params }) =>
		htmlResponse(reopenPage({ frame, team: await adminTeam(deps, params.id), now: deps.now() })));
	router.post("/admin/teams/:id/reopen", async ({ deps, viewer, params }) => {
		await reopenTeam(deps, viewer.email, await adminTeam(deps, params.id));
		return redirect("/admin/teams?done=reopened");
	}, { confirm: true });

	router.get("/admin/teams/:id/delete", async ({ deps, frame, params }) =>
		htmlResponse(deletePage({ frame, team: await adminTeam(deps, params.id), now: deps.now() })));
	router.post("/admin/teams/:id/delete", async ({ req, deps, viewer, frame, params }) => {
		const { confirmCode } = await parseForm(req, DeleteForm);
		const shown = await adminTeam(deps, params.id);
		return orAgain(() => deleteTonight(deps, viewer.email, shown, confirmCode), "tonight",
			async (error, status) => htmlResponse(deletePage({ frame, team: shown, now: deps.now(), error }), status));
	});

	router.get("/admin/teams/:id/keep", async ({ deps, frame, params }) =>
		htmlResponse(keepPage({ frame, team: await adminTeam(deps, params.id), now: deps.now() })));
	router.post("/admin/teams/:id/keep", async ({ deps, viewer, params }) => {
		await cancelDelete(deps, viewer.email, await adminTeam(deps, params.id));
		return redirect("/admin/teams?done=kept");
	}, { confirm: true });
}
