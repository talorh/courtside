import { logProblem } from "../admin/problem-log.ts";
import { html, type SafeHtml } from "../../shared/html.ts";
import type { TeamDeps } from "../../app/deps.ts";
import type { Member } from "../members/members-repository.ts";
import { listPlayhqFixtures } from "./playhq-repository.ts";

/**
 * For team managers, on every page: a PlayHQ fixture whose last check failed (PlayHQ down, changed, or turning
 * Cloudflare away), so the 8-hourly checks don't fail unnoticed. Never breaks a page: a failure here shows nothing.
 */
export async function playhqAlert(deps: TeamDeps, member: Member): Promise<SafeHtml | ""> {
	if (member.role !== "manager") return "";
	try {
		const failing = (await listPlayhqFixtures(deps.db, deps.team.id)).filter((f) => f.lastError);
		if (!failing.length) return "";
		return html`<div class="note warn" role="status"><b>PlayHQ couldn't be read</b> for ${failing.map((f) => f.name).join(", ")}, so new or
changed games may be missing. <a href="/fixture">See the Fixture</a> (Check now tries again). <span class="small">Only team managers see this.</span></div>`;
	} catch (err) {
		console.error(JSON.stringify({ event: "playhq_alert_failed", teamId: deps.team.id, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: deps.team.id, who: member.email, what: "A team manager's note about PlayHQ couldn't be checked", error: err });
		return "";
	}
}
