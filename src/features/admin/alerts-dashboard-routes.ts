// Alerts' old address, from when it was Support's second tab: it's the top of Insights now, so a bookmark lands there.
import type { AdminRouter } from "../../app/admin-router.ts";
import { redirect } from "../../app/respond.ts";

export function alertsDashboardRoutes(router: AdminRouter): void {
	router.get("/admin/support/alerts", async () => redirect("/admin#alerts", 302));
}
