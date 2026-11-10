import { CLUB } from "../../../club.ts";
// The welcome as an email in the site's style: the top bar (Courtside, the team's name under it), a card a
// section with green header bands, the green button (ui/email-layout.ts; the sign-in code's email shares it).
import { html, type SafeHtml } from "../../../shared/html.ts";
import { EMAIL, emailCard, emailShell } from "../../../ui/email-layout.ts";
import { teamLabel } from "../../teams/team-code.ts";
import { firstName, type WelcomeFor, type WelcomeSection, welcomeSections } from "../welcome-message.ts";

const S = EMAIL;

/** A line's **bold** parts in <b>, everything escaped. */
const bold = (line: string): SafeHtml => html`${line.split("**").map((part, i) => (i % 2 ? html`<b>${part}</b>` : part))}`;

const section = (s: WelcomeSection) => emailCard(html`${
	s.steps ? html`<ol style="${S.list}">${s.steps.map((step) => html`<li style="${S.item}">${bold(step.text)}</li>`)}</ol>` : ""}${
	s.points ? html`<ul style="${S.list}">${s.points.map((p) => html`<li style="${S.item}">${bold(p)}</li>`)}</ul>` : ""}${
	s.outro ? html`<p style="${S.p}">${bold(s.outro)}</p>` : ""}`, s.heading);

/** The whole email: the site's top bar, a card with the button, a card a section, and the club's cheer. */
export function welcomeEmailHtml(w: WelcomeFor): string {
	const label = teamLabel(w.team), first = firstName(w.manager.name);
	return emailShell({
		title: `${label}'s private site is ready`, heading: CLUB.siteName, sub: label,
		rows: html`${emailCard(html`<p style="margin:0 0 14px">Hi${first ? html` ${first}` : ""},</p><p style="${S.p}"><b>${label}'s private site is ready</b> at ${new URL(w.origin).host}.</p>
<p style="margin:0 0 14px"><a href="${w.origin}" style="${S.button}">Open ${label}'s site</a></p>`)}
${welcomeSections(w).map(section)}
<tr><td style="padding:4px 8px 0;text-align:center"><p style="margin:0 0 6px;font-size:20px;font-weight:800;color:${CLUB.colors.light.bar}">${CLUB.cheer}</p></td></tr>`,
		footer: `From ${CLUB.siteName}. Private to your team: only people you add can sign in.`,
	});
}
