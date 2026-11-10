import { CLUB, mailFrom } from "../../club.ts";
// A new team manager's welcome: only what they need to start (signing in, setting the team up, where to get help),
// emailed when a team is onboarded and shown on the admin's welcome page to send another way. Help has the rest.
// The email's HTML (views/welcome-email.ts) and this plain text come from the same sections.
import { teamLabel } from "../teams/team-code.ts";
import { teamCopy } from "../teams/team-copy.ts";
import type { Team } from "../teams/team.ts";

/** One section. Its lines mark what to tap, and each point's name, as **bold**. */
export interface WelcomeSection {
	heading: string;
	steps?: Array<{ text: string }>;
	points?: string[];
	outro?: string;
}

/** Who it's for. `byEmail`: replies reach the admin who sent it, so it says to just reply. */
export interface WelcomeFor { team: Team; manager: { name: string; email: string }; origin: string; byEmail: boolean }

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export function welcomeSections(w: WelcomeFor): WelcomeSection[] {
	return [
		{ heading: "Signing in", points: [`Sign in with **${w.manager.email}**: a code is emailed to you, no password. On Hotmail or Outlook it can land in Junk: mark it **Not junk** and add ${mailFrom()} to your contacts, and the next ones come to your inbox.`] },
		{ heading: "Getting set up", steps: [
			{ text: "**Players:** on **Manage team**, add your squad under Players, by number and name." },
			{ text: "**People:** on Manage team, under People, add each person's email, name and role with **Add a person**." },
			{ text: "**Games:** on **Fixture**, tap **Add fixture** and paste your team's public PlayHQ link, or tap **Add game** for each one." },
			{ text: "**Roster:** on **Roster**, add your families' surnames, set your game day duties, then tap **Generate roster**." },
			{ text: `**Tell the families:** post ${new URL(w.origin).host} in the team chat, and that on Hotmail or Outlook their code may be in Junk (they mark it **Not junk**).` },
		] },
		{ heading: "Questions?", outro: `Tap **Help** at the top right. ${teamCopy(w.team).helper} answers most things, and there's a form at the bottom to contact support${w.byEmail ? ", or just reply to this email" : ""}.` },
	];
}

const plain = (line: string) => line.replaceAll("**", "");

/** The welcome as plain text, spaced out to read on a phone: the email's text part, and the admin's copy to send
 * another way (a text, say). */
export function welcomeMessage(w: WelcomeFor): string {
	const first = firstName(w.manager.name);
	const out = [`Hi${first ? ` ${first}` : ""},`, "", `${teamLabel(w.team)}'s private site is ready: ${w.origin}`];
	for (const s of welcomeSections(w)) {
		out.push("", "", s.heading.toUpperCase());
		s.steps?.forEach((step, i) => out.push("", `${i + 1}. ${plain(step.text)}`));
		for (const point of s.points ?? []) out.push("", `• ${plain(point)}`);
		if (s.outro) out.push("", plain(s.outro));
	}
	out.push("", "", CLUB.cheer);
	return out.join("\n");
}
