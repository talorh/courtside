// The admin area's Documentation page (the same for every admin, nothing read from the database), and its AI assistant.
import type { AdminRouter } from "../../app/admin-router.ts";
import { htmlResponse, jsonOk } from "../../app/respond.ts";
import { parseJson } from "../../shared/validation.ts";
import { askDocs, docsAskSchema } from "./docs-assistant.ts";
import { docsPage } from "./views/docs-page.ts";

export function docsRoutes(router: AdminRouter): void {
	router.get("/admin/docs", async ({ frame }) => htmlResponse(docsPage(frame)));

	router.post("/admin/docs/ask", async ({ req, viewer, deps }) => {
		const { question } = await parseJson(req, docsAskSchema);
		return jsonOk(await askDocs(deps, viewer.email, question));
	});
}
