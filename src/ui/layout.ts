import { CLUB, siteOrigin } from "../club.ts";
import { films, hasRole, type Role } from "../auth/permissions.ts";
import type { Viewer } from "../auth/viewer.ts";
import type { Member } from "../features/members/members-repository.ts";
import { teamLabel } from "../features/teams/team-code.ts";
import type { Team } from "../features/teams/team.ts";
import { html, raw, type SafeHtml } from "../shared/html.ts";
import { ALERTS_SLOT, LIVE_SLOT } from "./page-slots.ts";
import { adminStrip } from "./admin-strip.ts";
import { closedBanner } from "./closed-banner.ts";
import { ICON_BELL, ICON_CALENDAR, ICON_DOOR, ICON_HELP, ICON_LIVE, ICON_PEOPLE, ICON_PHOTO, ICON_PLAY, ICON_ROSTER, ICON_SHIELD, ICON_SWAP, ICON_UPLOAD } from "./icons.ts";
import { teamCopy } from "../features/teams/team-copy.ts";

export type NavKey = "games" | "upload" | "live" | "fixture" | "notifications" | "manage" | "help" | "roster" | "photos";

// Upload comes first and the two main jobs are big, labelled buttons: the site must be obvious to every parent.

// `adds`: a page for adding to the team (uploads, Go live), so not offered once its season is over. `film`: only for those
// who film, everyone but Watch only.
const NAV: Array<{ key: NavKey; href: string; label: string; role: Role; icon?: SafeHtml; className?: string; adds?: boolean; film?: boolean }> = [
	{ key: "upload", href: "/upload", label: "Upload video", role: "filmer", icon: ICON_UPLOAD, className: "big up", adds: true, film: true },
	{ key: "games", href: "/games", label: "Watch games", role: "watcher", icon: ICON_PLAY, className: "big watch" },
	{ key: "live", href: "/live", label: "Go live", role: "filmer", icon: ICON_LIVE, className: "big live", adds: true, film: true },
	{ key: "roster", href: "/roster", label: "Roster", role: "watcher", icon: ICON_ROSTER, className: "big grey" },
	{ key: "fixture", href: "/fixture", label: "Fixture", role: "watcher", icon: ICON_CALENDAR, className: "big grey" },
	// Photos took Help's grey button, so the top bar is no taller than it was; Help is the oval that
	// says Help at the top right (easier to spot than the round ? it was for a day).
	{ key: "photos", href: "/photos", label: "Photos", role: "watcher", icon: ICON_PHOTO, className: "big grey" },
	{ key: "help", href: "/help", label: "Help", role: "watcher", icon: ICON_HELP, className: "round" },
	// The team manager's links carry icons for the desktop view's sidebar (desktop.css); the phone's strip hides them.
	{ key: "manage", href: "/manage", label: "Manage team", role: "manager", icon: ICON_PEOPLE },
	{ key: "notifications", href: "/notifications", label: "Notifications", role: "manager", icon: ICON_BELL },
];

/** The pages this role can open, in top bar order: the one table of who sees which link (Home uses it too). A closed
 * team's season is over: nothing to upload or go live for. */
export const navFor = (role: Role, closed = false) => NAV.filter((item) => hasRole(role, item.role) && !(closed && item.adds) && (!item.film || films(role)));

/** What a team page's frame shows from its request (RequestCtx.frame): the team, the membership acted as, who's asking
 * (their teams, and whether they're an admin) and the role an admin is viewing the team as. */
export interface PageFrame { team: Team; member: Member; viewer: Viewer; viewAs: Role | null }

// What a link preview shows of the site (only the sign-in page has it): nothing about any team.
const PREVIEW = html`<meta property="og:type" content="website"><meta property="og:title" content="${CLUB.siteName}">
<meta property="og:description" content="Private game videos and photos for each team's families and coaches."><meta property="og:image" content="${siteOrigin()}/logo.png">`;

export interface LayoutOptions {
	title: string;
	/** null for the pages that are no team's (Which team?, not on a team's list, errors, the admin area). */
	frame: PageFrame | null;
	/** The top bar of a page that's no team's (the admin area's). */
	bar?: SafeHtml;
	current?: NavKey;
	refreshSeconds?: number;
	scripts?: string[];
	/** Stylesheets after app.css, and the body's class: the admin area's own (admin.css, `admin`). */
	styles?: string[];
	bodyClass?: string;
	/** The admin area: view.js too, for its own switch to the phone's view on a computer and back (team pages always have it). */
	view?: boolean;
	/** The sign-in page only: a link preview's card (a link shared in WhatsApp), the site's name, a line and the logo. */
	preview?: boolean;
}

/** The team's name at the top opens Which team? when there's another team of theirs to go to: for someone in two or more
 * teams, and for an admin visiting one they aren't in (the way back), with Switch team under it to say so, which
 * makes switching obvious there. Else it's Home, as it was: an admin opens any other team from Admin, Teams, so
 * someone in only one team is never asked which. */
const switchesTeam = (frame: PageFrame) => frame.member.hidden || frame.viewer.memberships.filter((m) => !m.member.hidden).length > 1;

// Every post form says which team its page was for, so a write made after switching team in another window is refused
// rather than saved to the wrong team. Added here, in one place, so a new form can't leave it out;
// scripts/check-rules.mjs makes sure every post form is spelled method="post", as this looks for.
const POST_FORM = /<form\b[^>]*\bmethod="post"[^>]*>/g;
const withTeamField = (body: SafeHtml, teamId: string): SafeHtml => {
	const field = html`<input type="hidden" name="_team" value="${teamId}">`.__html;
	return raw(body.__html.replace(POST_FORM, (form) => form + field));
};

/** Anyone's choice of view on a computer (public/view.js; shown only there, by desktop.css): in the desktop view, Switch
 * to mobile view at the sidebar's foot, just above Help; in the mobile view, Switch to desktop
 * view in the strip along the bottom of the top bar. */
export const viewSwitch = (to: "mobile" | "desktop") => html`<button class="viewswitch" type="button" data-view-to="${to}">Switch to ${to} view</button>`;

function appBar(frame: PageFrame, current?: NavKey): SafeHtml {
	const items = navFor(frame.member.role, frame.team.status !== "active");
	const here = (key: NavKey) => (key === current ? html` aria-current="page"` : "");
	// Big buttons first (on a phone, the coloured ones on one row and the grey ones on the next); the team manager's
	// small links (Manage team and Notifications; and Admin for a site admin) go in a strip along the bottom. At
	// the top right: Help, light or dark, and sign out.
	const link = (i: (typeof NAV)[number]) => html`<a href="${i.href}" class="${i.className ?? ""}"${here(i.key)}>${i.icon ?? ""}${i.label}</a>`;
	const big = (grey: boolean) => items.filter((i) => i.className?.startsWith("big") && i.className.includes("grey") === grey).map(link);
	const help = items.find((i) => i.key === "help");
	const switches = switchesTeam(frame);
	return html`<header class="appbar"><div class="wrap">
<a class="brand" href="${switches ? "/teams" : "/"}"><img src="/logo.png" alt="" width="38" height="38"><span><b>${teamLabel(frame.team)}</b>${switches ? html`<span class="switchteam">${ICON_SWAP}Switch team</span>` : ""}</span></a>
${help ? html`<a class="helpbtn" href="${help.href}" aria-label="Help, and Ask ${teamCopy(frame.team).helper}"${here("help")}>${ICON_HELP}Help</a>` : ""}
<button class="themebtn" type="button" id="theme-toggle" aria-label="Switch between light and dark mode" hidden></button>
<a class="signoutbtn" href="/signout" data-signout aria-label="Sign out" title="Sign out">${ICON_DOOR}</a>
<nav class="appnav"><div class="navmain">${big(false)}</div>
<div class="navgrey">${big(true)}</div>
<div class="navsub">${items.filter((i) => !i.className).map(link)}${frame.viewer.isAdmin ? html`<a href="/admin">${ICON_SHIELD}Admin</a>` : ""}${viewSwitch("desktop")}</div></nav>
${viewSwitch("mobile")}</div></header>`;
}

export function layout(options: LayoutOptions, body: SafeHtml): SafeHtml {
	const refresh = options.refreshSeconds ? html`<meta http-equiv="refresh" content="${options.refreshSeconds}">` : "";
	// Page scripts are ES modules (deferred by default; upload.js imports upload-net.js). Every page has webapp.js (the
	// site as a Home Screen app), pull-refresh.js (pull down to reload, in the app), signout.js (the door at the top
	// right) and confirm.js (a delete's "are you sure").
	const scripts = ["/webapp.js", "/pull-refresh.js", "/signout.js", "/confirm.js", ...(options.scripts ?? [])].map((src) => html`<script type="module" src="${src}"></script>`);
	// Added to a Home Screen, the site is its name (club.ts, not the page's title) and opens on the home page, full screen
	// (manifest.webmanifest). Fetched with the site's cookies, as every file is behind the sign-in.
	const { frame } = options;
	// Page scripts read the team from here: its id for the X-Courtside-Team header on every write, its name, and who to ask.
	const team = frame ? html` data-site="${CLUB.siteName}" data-team="${frame.team.id}" data-team-name="${teamLabel(frame.team)}" data-ask="${frame.team.askName ?? ""}"` : "";
	// Every team page also gets desktop.css and view.js (team managers first, then every role): on a
	// wide screen with a mouse it lays the same page out like the admin area, a sidebar beside it, with a switch to the
	// phone's view and back; on a phone or a tablet it changes nothing.
	const teamPage = frame !== null;
	const styles = [...(options.styles ?? []), ...(teamPage ? ["/desktop.css"] : [])];
	const bodyClass = [options.bodyClass, teamPage ? "desk" : ""].filter(Boolean).join(" ");
	return html`<!doctype html>
<html lang="en-AU"${team}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">${options.preview ? PREVIEW : ""}${refresh}<title>${options.title} · ${frame ? teamLabel(frame.team) : CLUB.siteName}</title>
<script src="/theme.js"></script>${teamPage || options.view ? html`<script src="/view.js"></script>` : ""}<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"><meta name="apple-mobile-web-app-title" content="${CLUB.siteName}">
<link rel="stylesheet" href="/club.css"><link rel="stylesheet" href="/app.css">${styles.map((href) => html`<link rel="stylesheet" href="${href}">`)}${scripts}</head>
<body${bodyClass ? html` class="${bodyClass}"` : ""}>${frame ? appBar(frame, options.current) : options.bar ?? ""}<main class="wrap view">${frame ? raw(LIVE_SLOT) : ""}${frame?.member.role === "manager" ? raw(ALERTS_SLOT) : ""}${frame ? withTeamField(html`${adminStrip(frame)}${closedBanner(frame)}${body}`, frame.team.id) : body}</main></body></html>`;
}
