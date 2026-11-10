// The admin area's Costs: every team of a season (/admin/costs) and each team's own page (/admin/costs/:id), in the club's currency
// or Cloudflare's own US dollars (?cur=usd), the season's report for Excel, and setting a team's budget there (Australian
// dollars; logged). Each page checks the budgets (in the club's currency, as they're set) as it opens.
import { z } from "zod";
import type { AdminRouter } from "../../app/admin-router.ts";
import { notFound } from "../../app/errors.ts";
import { fileResponse, htmlResponse, redirect } from "../../app/respond.ts";
import { seasonOf } from "../../shared/time.ts";
import { doneMessage, parseForm } from "../../shared/validation.ts";
import { XLSX_TYPE, xlsxWorkbook } from "../../shared/xlsx.ts";
import { adminLogStatement } from "./admin-log-repository.ts";
import { checkBudgets } from "./budget-checks.ts";
import { currencyOf, inCurrency } from "./costs-currency.ts";
import { type Costs, inLocal, loadCosts } from "./costs-load.ts";
import { DEFAULT_BUDGET_LOCAL } from "./costs-prices.ts";
import { costReport } from "./costs-report.ts";
import { costTeams, setBudget } from "./costs-repository.ts";
import { costsPage } from "./views/costs-page.ts";
import { COST_MESSAGES, costTeamPage } from "./views/costs-team-page.ts";

/** the club's currency, up to cents; empty for the default. */
const BudgetForm = z.object({
	budget: z.string().trim().regex(/^(\d{1,6}(\.\d{1,2})?)?$/, "Type the budget in dollars, like 150 or 220.50, or leave it empty for the default."),
	cur: z.string().max(3).default(""),
});

/** One season at a time: this one, or any a team was onboarded for (?season=2025, its starting year); its teams in the
 * currency asked for. */
function seasonCosts(c: Costs, url: URL, now: Date) {
	const cur = currencyOf(url), seasons = [...new Set([seasonOf(now).start, ...c.costs.map((x) => x.team.seasonStart)])].sort((a, b) => b - a);
	const picked = Number(url.searchParams.get("season")), season = seasons.includes(picked) ? picked : seasonOf(now).start;
	return { cur, seasons, season, costs: inCurrency(c.costs, cur, c.rate.localPerUsd).filter((x) => x.team.seasonStart === season) };
}

export function costsRoutes(router: AdminRouter): void {
	router.get("/admin/costs", async ({ deps, frame, url }) => {
		const c = await loadCosts(deps), now = deps.now();
		await checkBudgets(deps, inLocal(c));
		return htmlResponse(costsPage({ frame, ...c, ...seasonCosts(c, url, now), now }));
	});
	router.get("/admin/costs/report.xlsx", async ({ deps, url }) => {
		const c = await loadCosts(deps), now = deps.now(), { cur, season, costs } = seasonCosts(c, url, now);
		const file = xlsxWorkbook(costReport({ costs, season, cur, rate: c.rate, bill: c.bill, now }));
		return fileResponse(file, XLSX_TYPE, `site-costs-${season}-${String(season + 1).slice(2)}-${cur}.xlsx`);
	});
	router.get("/admin/costs/:id", async ({ deps, frame, params, url }) => {
		const c = await loadCosts(deps), cur = currencyOf(url);
		const mine = inCurrency(c.costs, cur, c.rate.localPerUsd).find((x) => x.team.id === params.id);
		if (!mine) throw notFound("Team");
		await checkBudgets(deps, inLocal(c));
		return htmlResponse(costTeamPage({ frame, costs: mine, viewing: c.viewing, cur, rate: c.rate, now: deps.now(), billed: c.bill.rows.length > 0, message: doneMessage(COST_MESSAGES, url) }));
	});
	router.post("/admin/costs/:id/budget", async ({ req, deps, params, viewer }) => {
		const team = (await costTeams(deps.db)).find((t) => t.id === params.id);
		if (!team) throw notFound("Team");
		const { budget, cur } = await parseForm(req, BudgetForm);
		const amount = budget === "" ? null : Number(budget);
		const was = team.budgetDefault ? null : team.budget;
		if (amount !== was) {
			const words = (n: number | null) => (n === null ? `the default, $${DEFAULT_BUDGET_LOCAL.toFixed(2)}` : `$${n.toFixed(2)}`);
			await deps.db.batch([setBudget(deps.db, team.id, amount), adminLogStatement(deps.db, { device: deps.device,
				adminEmail: viewer.email, teamId: team.id, action: "team_edited", detail: `season budget: ${words(amount)} (was ${words(was)})`, at: deps.now().toISOString(),
			})]);
		}
		// Back to the page in the currency it was in.
		return redirect(`/admin/costs/${team.id}?done=budget${cur === "usd" ? "&cur=usd" : ""}`);
	});
}
