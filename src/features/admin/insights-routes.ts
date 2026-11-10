// The admin area's landing page, Insights: is the site all right (the alerts and the checks made as it opens:
// health-load.ts), then usage per team and overall. The figures behind the checks are on Platform.
import type { AdminRouter } from "../../app/admin-router.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import { liveSessionsByView, weeklyDevices } from "../../auth/device-view-repository.ts";
import { addDays, localDate, localTime } from "../../shared/time.ts";
import { countPeopleOnTeams } from "../teams/teams-repository.ts";
import { loadHealth } from "./health-load.ts";
import { needsAttention } from "./insights-attention.ts";
import { hourlyActivity, mostWatched, signedInSince, teamCounts } from "./insights-repository.ts";
import { byDayAndHour, standouts, WEEKS, weeklyTotals, weekStarts } from "./insights-service.ts";
import { insightsPage } from "./views/insights-page.ts";

export function insightsRoutes(router: AdminRouter): void {
	// Its address until Insights became the admin area's landing page: a bookmark still works.
	router.get("/admin/insights", async () => redirect("/admin", 302));
	router.get("/admin", async ({ deps, frame }) => {
		const now = deps.now();
		const since30 = addDays(now, -30).toISOString();
		const weeks = weekStarts(now);
		const [teams, signedIn, people, hourly, watched, health, devicesNow, devicesWeekly] = await Promise.all([
			teamCounts(deps.db, { since30, nowLocal: localTime(now), day30: localDate(addDays(now, -30)) }),
			signedInSince(deps.db, addDays(now, -7).toISOString(), since30), countPeopleOnTeams(deps.db),
			hourlyActivity(deps.db, addDays(now, -7 * WEEKS - 1).toISOString()), mostWatched(deps.db, since30, 3), loadHealth(deps, now),
			liveSessionsByView(deps.db, now.toISOString()), weeklyDevices(deps.db, weeks),
		]);
		const weekly = (hours: Array<{ h: string; n: number }>) => weeklyTotals(hours, weeks);
		// The alerts are the checks; what else needs an admin (support, removal requests, a team with no manager).
		return htmlResponse(insightsPage({
			frame, now, teams, people, signedIn, weeks, heat: byDayAndHour(hourly.watchers), attention: needsAttention({ teams }), health,
			series: { views: weekly(hourly.watchers), videos: weekly(hourly.uploads), streams: weekly(hourly.streams), clips: weekly(hourly.clips), photos: weekly(hourly.photos), downloads: weekly(hourly.downloads) },
			standouts: standouts(teams, watched), devices: { now: devicesNow, weekly: devicesWeekly },
		}));
	});
}
