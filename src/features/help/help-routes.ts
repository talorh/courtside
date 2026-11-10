import { htmlResponse, jsonOk, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { parseJson } from "../../shared/validation.ts";
import { askHelper, askSchema } from "./ask-service.ts";
import { getRosterDuties } from "../roster/roster-repository.ts";
import { helpFor } from "./views/faq-item.ts";
import { helpPage } from "./views/help-page.ts";

export function registerHelpRoutes(router: Router): void {
	// Each role its own topics: a team manager's own questions first, and no separate guide.
	router.get("/help", "watcher", async ({ frame, deps }) => htmlResponse(helpPage(frame, helpFor(deps.team, await getRosterDuties(deps.db, deps.team.id)))));
	// Help's old address: old links and bookmarks still arrive (a link to a question keeps its #).
	router.get("/faq", "watcher", async () => redirect("/help", 302));
	router.post("/api/ask", "watcher", async ({ req, member, deps }) =>
		jsonOk({ answer: await askHelper(deps, member, (await parseJson(req, askSchema)).question, req.headers.get("User-Agent")) }), { closedTeams: true });
}
