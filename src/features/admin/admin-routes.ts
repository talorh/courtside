// The admin area's pages. Every one is for site admins only: handle-request.ts answers
// "Page not found" to anyone else before any of these run.
import { AdminRouter } from "../../app/admin-router.ts";
import { adminsRoutes } from "./admins-routes.ts";
import { alertsDashboardRoutes } from "./alerts-dashboard-routes.ts";
import { costsRoutes } from "./costs-routes.ts";
import { docsRoutes } from "./docs-routes.ts";
import { insightsRoutes } from "./insights-routes.ts";
import { logRoutes } from "./log-routes.ts";
import { platformRoutes } from "./platform-routes.ts";
import { supportAdminRoutes } from "./support-admin-routes.ts";
import { teamLifecycleRoutes } from "./team-lifecycle-routes.ts";
import { teamsAdminRoutes } from "./teams-admin-routes.ts";

export function buildAdminRouter(): AdminRouter {
	const router = new AdminRouter();
	teamsAdminRoutes(router);
	teamLifecycleRoutes(router);
	insightsRoutes(router);
	platformRoutes(router);
	logRoutes(router);
	costsRoutes(router);
	adminsRoutes(router);
	// Before the support routes, whose /admin/support/:id would take it for a ticket.
	alertsDashboardRoutes(router);
	supportAdminRoutes(router);
	docsRoutes(router);
	return router;
}
