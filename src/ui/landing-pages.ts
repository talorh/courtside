// The pages that belong to no team: Which team?, and someone on no team's list.
import type { Team } from "../features/teams/team.ts";
import { teamLabel } from "../features/teams/team-code.ts";
import { html, raw, type SafeHtml } from "../shared/html.ts";
import { CLUB } from "../club.ts";
import { CLUB_MARK } from "./club-mark-inline.ts";
import { LAUNCH_CSS } from "./launch-style.ts";
import { entryPage } from "./status-pages.ts";

/** The spinning basketball: drawn here, so it's sharp at any size and
 * needs no file. Shaded orange with a pebbled grain (an SVG noise filter), a highlight, the two straight seams and the
 * two curved ones; launch-style.ts turns it as it bounces on its shadow. */
const BASKETBALL = raw(`<div class="launchspin" role="progressbar" aria-label="Opening the site"><div class="launchbounce"><svg class="launchball" viewBox="0 0 100 100" aria-hidden="true">
<defs>
<radialGradient id="ball" cx="34%" cy="30%" r="75%"><stop offset="0" stop-color="#FFB46A"/><stop offset=".45" stop-color="#E97A24"/><stop offset=".85" stop-color="#B4511A"/><stop offset="1" stop-color="#7E3510"/></radialGradient>
<radialGradient id="shine" cx="30%" cy="26%" r="40%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="pebble" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .9 .9 .9 0 -.55"/></filter>
<clipPath id="round"><circle cx="50" cy="50" r="46.5"/></clipPath>
</defs>
<circle cx="50" cy="50" r="47" fill="url(#ball)"/>
<rect width="100" height="100" fill="#3A1A08" filter="url(#pebble)" clip-path="url(#round)" opacity=".4"/>
<circle cx="50" cy="50" r="47" fill="url(#shine)"/>
<path d="M50 3v94M3 50h94M24 11c18 21 18 57 0 78M76 11c-18 21-18 57 0 78" fill="none" stroke="#2A1608" stroke-width="3.6" stroke-linecap="round"/>
<path d="M50 3v94M3 50h94M24 11c18 21 18 57 0 78M76 11c-18 21-18 57 0 78" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/>
<circle cx="50" cy="50" r="47" fill="none" stroke="#2A1608" stroke-width="2.6"/></svg></div><i class="launchshadow"></i></div>`);

/**
 * The Home Screen app's first page (a spinner, not a white screen: the club's logo and
 * a proper basketball): the club's deep colour at once, its logo, the site's name and the
 * ball bouncing, while landing.js opens `to` in its place. Served before any database lookup, and the logo is in
 * the page itself (a data: URL, club-mark-inline.ts; its CSP allows it), so it shows with no fetch of its own: a phone's cache once
 * held a failed load of it from a moment mid-deploy. Its look is in the page too (launch-style.ts, with the club's colours
 * from /club.css), so it never waits on app.css. Nothing else on it: only
 * the Home Screen app lands here, and it always runs scripts (no Continue link for a browser without them: the page is
 * only ever a moment). Never an automatic refresh, so nothing can loop.
 */
export function launchPage(to = "/"): SafeHtml {
	return html`<!doctype html>
<html lang="en-AU" data-to="${to}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="${CLUB.colors.light.bar}"><title>${CLUB.siteName}</title>
<link rel="icon" href="/favicon.png" type="image/png"><link rel="stylesheet" href="/club.css"><style>${raw(LAUNCH_CSS)}</style><script type="module" src="/landing.js"></script></head>
<body class="launch"><main class="launchscreen"><img class="launchmark" src="${CLUB_MARK}" alt="" width="400" height="320">
<h1 class="launchname">${CLUB.siteName}</h1>${BASKETBALL}</main></body></html>`;
}

/** A link to something in another of the person's teams: say whose it is and offer to switch and open it. */
export function otherTeamPage(p: { team: Team; said: string; next: string }): SafeHtml {
	return entryPage({ title: "Another team" }, p.said.replace(/\.$/, ""), html`
<p>You're in that team too. Switch to it to open it here.</p>
<form method="post" action="/teams/switch"><input type="hidden" name="team" value="${p.team.id}"><input type="hidden" name="next" value="${p.next}"><button class="btn primary">Switch to ${teamLabel(p.team)}</button></form>
<p class="small"><a href="/">Stay where you are</a></p>`);
}

export function notOnTeamPage(email: string): SafeHtml {
	return entryPage({ title: "Not on the list" }, "Not on a team's list yet", html`
<p>You're signed in as <b>${email}</b>, but that email isn't on a team's list yet.</p>
<p>Ask your team manager to sub you in, then tap Try again.</p>
<p><a class="btn" href="/">Try again</a></p>
<p class="small"><a href="/signout" data-signout>Sign out</a> (to sign in with another email)</p>`);
}

/** own: the teams the person is in (current, then past seasons); others: every other team, for an admin. */
export interface WhichTeamProps { current: Team | null; own: Team[]; others: Team[]; next: string }

export function whichTeamPage(p: WhichTeamProps): SafeHtml {
	const shown = [...p.own, ...p.others];
	// Where two teams share a code (last season's, closed, and this season's), each says its season.
	const label = (t: Team) => teamLabel(t, { season: shown.filter((o) => o.code === t.code).length > 1 });
	const here = (t: Team) => t.id === p.current?.id;
	const choice = (t: Team) => html`<form method="post" action="/teams/switch"><input type="hidden" name="team" value="${t.id}"><input type="hidden" name="next" value="${p.next}">
<button class="btn teambtn${here(t) ? " here" : ""}"${here(t) ? html` aria-current="true"` : ""}><b>${label(t)}</b><span class="small">${t.name}${here(t) ? " (you're here)" : ""}</span></button></form>`;
	const group = (title: string, teams: Team[]) => (teams.length ? html`<h2 class="eyebrow">${title}</h2>${teams.map(choice)}` : "");
	return entryPage({ title: "Which team?" }, "Which team?", html`
<p>Pick a team.${p.own.length > 1 ? html` You can switch any time: tap <b>Switch team</b> at the top of any page.` : ""}</p>
${group("Your teams", p.own.filter((t) => t.status === "active"))}${group("Past seasons", p.own.filter((t) => t.status !== "active"))}${group("All teams (site admin)", p.others)}
${p.current ? html`<p><a href="/">Back to ${teamLabel(p.current)}</a></p>` : ""}
<p class="small"><a href="/signout" data-signout>Sign out</a></p>`);
}
