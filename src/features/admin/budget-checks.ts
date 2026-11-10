// Each running team against its season's budget, in the club's currency: over it (what it's cost so far is more) is
// urgent; on track to go over (its season, estimated, is more) warns. The worst team's words are the alert's (a ticket,
// like every alert). Checked when Costs or Insights opens, and by the 3am job every night.
import { alertFailed } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { teamLabel } from "../teams/team-code.ts";
import type { AlertLevel } from "./alerts-repository.ts";
import { setAlert } from "./alerts-service.ts";
import { money } from "./costs-currency.ts";
import type { TeamCosts } from "./costs-estimate.ts";

export type BudgetLevel = AlertLevel | "none";

const aud = money("local");

export function budgetLevel(c: TeamCosts): BudgetLevel {
	if (c.team.status !== "active") return "none";
	if (c.soFar > c.team.budget) return "urgent";
	return c.estimate > c.team.budget ? "warn" : "ok";
}

/** "Saints B12.1: $40.00 so far of its $30.00 budget", or "…: on track for $45.00 of its $30.00 budget". */
export function budgetWords(c: TeamCosts): string {
	const of = `of its ${aud(c.team.budget)} budget`;
	return `${teamLabel(c.team)}: ${budgetLevel(c) === "urgent" ? `${aud(c.soFar)} so far ${of}` : `on track for ${aud(c.estimate)} ${of}`}`;
}

const RANK: Record<BudgetLevel, number> = { none: 0, ok: 1, warn: 2, urgent: 3 };

export async function checkBudgets(deps: AppDeps, costs: TeamCosts[]): Promise<void> {
	const over = costs.filter((c) => RANK[budgetLevel(c)] >= RANK.warn).sort((a, b) => RANK[budgetLevel(b)] - RANK[budgetLevel(a)]);
	const level: AlertLevel = over.length ? (budgetLevel(over[0]!) === "urgent" ? "urgent" : "warn") : "ok";
	const running = costs.filter((c) => budgetLevel(c) !== "none").length;
	const detail = over.length ? over.slice(0, 3).map(budgetWords).join("; ") + (over.length > 3 ? `; and ${over.length - 3} more` : "")
		: running ? `${running} ${running === 1 ? "team is" : "teams are"} within budget` : "No team is running";
	await setAlert(deps, "budget", level, detail).catch((err: unknown) => alertFailed(deps, "budget", err));
}
