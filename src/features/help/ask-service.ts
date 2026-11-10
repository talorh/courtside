import { CLUB } from "../../club.ts";
import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { HttpError } from "../../app/errors.ts";
import { addDays, localDate } from "../../shared/time.ts";
import { asksAdmin, type Role } from "../../auth/permissions.ts";
import type { Member } from "../members/members-repository.ts";
import { countQuestion } from "./ask-repository.ts";
import { getRosterDuties } from "../roster/roster-repository.ts";
import { helpText } from "./help-knowledge.ts";
import { helpFor, type HelpFor } from "./views/faq-item.ts";
import type { Team } from "../teams/team.ts";
import { teamCopy } from "../teams/team-copy.ts";
import { logProblem } from "../admin/problem-log.ts";

// Ask Virtual Team Manager (named for the team's manager where the team has an ask name: Virtual Sam in B12.1):
// one question in, one answer out, from the Help page only. Nothing is stored.

export const askSchema = z.object({ question: z.string().trim().min(2, "Type a question first.").max(300, "Keep it under 300 characters.") });

/** Questions per member per day: plenty for real use, and one person can't use up the team's daily AI allowance. */
export const DAILY_QUESTIONS = 20;

/** What Ask says when the AI can't answer. */
export const busy = (team: Team) => `${teamCopy(team).helper} can't answer just now. Try again in a little while, or check the questions below.`;

/** The asker's device, from the browser's name, so steps can match it ("How do I install it?"). Only the kind is told. */
export function deviceOf(userAgent: string | null): string | null {
	if (!userAgent) return null;
	if (/iPhone|iPad|iPod/.test(userAgent)) return "an iPhone or iPad";
	return /Android/.test(userAgent) ? "an Android phone" : "a computer";
}

/** Who the helper is, for this team: Virtual Team Manager, named for the team's ask name where it has one (teamCopy). */
function whoYouAre(team: Team): string {
	const copy = teamCopy(team);
	const intro = `You are ${copy.helper}, the helper on ${CLUB.siteName}: the private game-video site for the ${copy.long} basketball team.`;
	return team.askName ? `${intro} The real ${team.askName} is the team manager, and you answer for them.` : `${intro} You answer for the team manager.`;
}

/** Each question goes with the Help page the person asking sees: a team manager's has their own questions, and ends in
 * the form to ask the site's admin. */
const system = (team: Team, help: HelpFor, device: string | null, role: Role) => `${whoYouAre(team)}

Rules:
- Answer only from the Help page below. Never invent buttons, pages, features or facts that it doesn't mention.
- Give the Help page's own steps for a problem, in its order. Never add fixes of your own, such as restarting the phone.
- When the steps differ between iPhone and Android, give the ones for the asker's device unless they ask about another.
${asksAdmin(role)
	? "- If the Help page doesn't cover it, say you're not sure and suggest the support form at the bottom of the Help page."
	: `- If the Help page doesn't cover it, say you're not sure and suggest asking ${team.askName ? `the real ${team.askName}` : "the team manager"} at training.`}
- Plain English for parents who aren't technical. Short: under 120 words. Use a short numbered list for steps.
- Plain text only: no markdown, no bold, no headings, no links.
- ${CLUB.english} English spelling. No dashes as punctuation: use commas, colons or full stops.
- A little friendly basketball humour is fine, but the answer comes first.
- Only help with this site and the team's videos; politely decline anything else.
${device ? `\nThe person asking is using ${device}.\n` : ""}
Help page:
${helpText(help, role)}`;

export async function askHelper(deps: TeamDeps, member: Member, question: string, userAgent: string | null): Promise<string> {
	const now = deps.now();
	const asked = await countQuestion(deps.db, deps.team.id, member.id, localDate(now), localDate(addDays(now, -7)));
	if (asked > DAILY_QUESTIONS) {
		throw new HttpError(429, "too_many_questions", "That's a lot of questions for one day. Have a look through the questions below, or ask again tomorrow.");
	}
	try {
		// Belt and braces: the model sometimes adds bold or dashes anyway.
		const help = helpFor(deps.team, await getRosterDuties(deps.db, deps.team.id));
		return (await deps.ai.answer(system(deps.team, help, deviceOf(userAgent), member.role), question)).replace(/\*\*/g, "").replace(/\s*[—–]\s*/g, ", ");
	} catch (err) {
		// The AI being unavailable (or out of its daily allowance) isn't the parent's problem: say so kindly, and log it.
		console.error(JSON.stringify({ event: "ask_failed", teamId: deps.team.id, error: String(err) }));
		await logProblem(deps, { kind: "ai_failed", teamId: deps.team.id, who: member.email, what: "Ask didn't answer a question", error: err });
		return busy(deps.team);
	}
}
