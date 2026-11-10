// The admin area's Log: every line of the days asked for, then the filters (log-filter.ts), with what's happening right
// now in the team filtered to (or every team); the same lines for Excel.
import type { AdminRouter } from "../../app/admin-router.ts";
import type { AppDeps } from "../../app/deps.ts";
import { fileResponse, htmlResponse } from "../../app/respond.ts";
import { XLSX_TYPE, xlsxFile } from "../../shared/xlsx.ts";
import { listTeams } from "../teams/teams-repository.ts";
import { listSiteInProgress, listSiteWaiting } from "./activity-admin-repository.ts";
import { askedDays, logEntries } from "./log-entries.ts";
import { askedFilters, filterRows, logChoices, type LogFilters } from "./log-filter.ts";
import { logSheet } from "./log-report.ts";
import { logRow } from "./log-words.ts";
import { logPage } from "./views/log-page.ts";
import type { RightNow } from "./views/log-now.ts";

const asked = (deps: AppDeps, url: URL) => {
	const now = deps.now();
	return { now, filters: askedFilters(url, askedDays(url, now)) };
};

const logLines = async (deps: AppDeps, filters: LogFilters) => {
	const { entries, cut } = await logEntries(deps.db, filters.days);
	const all = entries.map(logRow);
	return { all, cut, lines: filterRows(all, filters) };
};

/** Right now for the Team filter's team (its key is code and season: log-words.ts), or every team without one. */
async function rightNowFor(deps: AppDeps, teamKey: string): Promise<RightNow> {
	const teams = await listTeams(deps.db);
	const team = teams.find((t) => `${t.code}-${t.seasonStart}` === teamKey);
	if (teamKey && !team) return { now: [], waiting: [], teams };
	const [now, waiting] = await Promise.all([listSiteInProgress(deps.db, team?.id ?? null), listSiteWaiting(deps.db, team?.id ?? null)]);
	return { now, waiting, teams };
}

export function logRoutes(router: AdminRouter): void {
	router.get("/admin/log", async ({ deps, frame, url }) => {
		const { now, filters } = asked(deps, url);
		const [{ all, cut, lines }, right] = await Promise.all([logLines(deps, filters), rightNowFor(deps, filters.team)]);
		return htmlResponse(logPage({ frame, lines, cut, filters, choices: logChoices(all, filters), now, rightNow: right }));
	});
	router.get("/admin/log.xlsx", async ({ deps, url }) => {
		const { now, filters } = asked(deps, url);
		const { lines } = await logLines(deps, filters);
		return fileResponse(xlsxFile(logSheet(lines, filters, now)), XLSX_TYPE, `site-log-${filters.days.from}-to-${filters.days.to}.xlsx`);
	});
}
