// An old address: redirected to the Alerts at the top of Insights, so a bookmark still works.
import type { AdminRouter } from "../../app/admin-router.ts";
import { redirect } from "../../app/respond.ts";

export function alertsDashboardRoutes(router: AdminRouter): void {
	router.get("/admin/support/alerts", async () => redirect("/admin#alerts", 302));
}
