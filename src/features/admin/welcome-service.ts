// Emailing a new team manager their welcome, in the site's style (ui/email-layout.ts) with its plain text beside it.
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { teamLabel } from "../teams/team-code.ts";
import type { Team } from "../teams/team.ts";
import { mailTeamManager } from "./admin-mail.ts";
import { welcomeEmailHtml } from "./views/welcome-email.ts";
import { welcomeMessage } from "./welcome-message.ts";

/** Emails the team manager their welcome (welcome-message.ts), formatted in the site's style with its plain text beside it:
 * "sent", or "failed" (logged), as the team stands either way and the welcome page has the message to send another way. */
export async function emailWelcome(deps: AppDeps, team: Team, admin: string, origin: string): Promise<"sent" | "failed"> {
	try {
		await mailTeamManager(deps, team.id, admin, (manager) => {
			const w = { team, manager, origin, byEmail: true };
			return { subject: `${teamLabel(team)}'s private site is ready`, text: welcomeMessage(w), html: welcomeEmailHtml(w) };
		});
		return "sent";
	} catch (err) {
		console.error(JSON.stringify({ event: "welcome_email_failed", teamId: team.id, error: String(err) }));
		await logProblem(deps, { kind: "email_failed", teamId: team.id, who: admin, what: "The welcome email to the new team's team manager didn't send", error: err });
		return "failed";
	}
}
