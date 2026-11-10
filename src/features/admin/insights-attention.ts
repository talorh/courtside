// What needs an admin besides the checks, first on Insights (a landing page): support requests waiting for an answer,
// families' removal requests waiting in any team (child safety), and a running team with no team manager. Worst first;
// each says where it's dealt with.
import { teamLabel } from "../teams/team-code.ts";
import type { TeamCounts } from "./insights-repository.ts";
import { plural } from "./insights-service.ts";

export interface Attention { level: "urgent" | "warn" | "info"; text: string; href: string; action: string }

const RANK: Record<Attention["level"], number> = { urgent: 2, warn: 1, info: 0 };

export function needsAttention(p: { teams: TeamCounts[] }): Attention[] {
	const items: Attention[] = [];
	const support = p.teams.reduce((n, t) => n + t.openSupport, 0);
	if (support) items.push({ level: "warn", text: `${support} support ${support === 1 ? "request is" : "requests are"} waiting for an answer.`, href: "/admin/support", action: "Open Support" });
	for (const t of p.teams) {
		if (t.openRequests) {
			items.push({ level: "warn", text: `${teamLabel(t.team)}: ${plural(t.openRequests, "removal request")} waiting for the team manager.`, href: `/admin/log?team=${t.team.code}-${t.team.seasonStart}`, action: "See the Log" });
		}
	}
	for (const t of p.teams) if (t.team.status === "active" && !t.managers) items.push({ level: "info", text: `${teamLabel(t.team)} has no team manager.`, href: "/admin/teams", action: "Open Teams" });
	return items.sort((a, b) => RANK[b.level] - RANK[a.level]);
}
