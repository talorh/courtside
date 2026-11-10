import { CLUB } from "../../../club.ts";
// The admin area's frame (a landing page, Insights first, more modern): on a computer a bottle-green
// sidebar, on a phone one row at the top with the sections in a row that scrolls sideways (admin.css, admin.js). Insights
// shows alerts that aren't ok and Support tickets waiting; light or dark and sign out stay at hand (no team name).
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { ICON_BOOK, ICON_CHART, ICON_CLOCK, ICON_COINS, ICON_DOOR, ICON_INBOX, ICON_LIST, ICON_PEOPLE, ICON_SERVER, ICON_SHIELD } from "../../../ui/icons.ts";
import { layout, viewSwitch } from "../../../ui/layout.ts";
import type { AdminNav } from "../admin-nav-repository.ts";

export type AdminNavKey = "insights" | "teams" | "support" | "platform" | "costs" | "admins" | "changelog" | "log" | "docs";

// The day-to-day sections, then the ones used now and then, in one list.
const NAV: Array<{ key: AdminNavKey; href: string; label: string; icon: SafeHtml }> = [
	{ key: "insights", href: "/admin", label: "Insights", icon: ICON_CHART }, { key: "teams", href: "/admin/teams", label: "Teams", icon: ICON_PEOPLE },
	{ key: "support", href: "/admin/support", label: "Support", icon: ICON_INBOX },
	{ key: "platform", href: "/admin/platform", label: "Platform", icon: ICON_SERVER }, { key: "costs", href: "/admin/costs", label: "Costs", icon: ICON_COINS },
	{ key: "admins", href: "/admin/admins", label: "Admins", icon: ICON_SHIELD }, { key: "changelog", href: "/admin/changelog", label: "Changelog", icon: ICON_LIST },
	{ key: "log", href: "/admin/log", label: "Log", icon: ICON_CLOCK },
	{ key: "docs", href: "/admin/docs", label: "Documentation", icon: ICON_BOOK },
];

/** The badges (their words for a screen reader too): on Insights, alerts that aren't ok (red when one is urgent); on
 * Support, tickets waiting for an answer; nothing when there's nothing waiting. */
function count(key: AdminNavKey, nav: AdminNav): SafeHtml | "" {
	const badge = (n: number, words: string, urgent = false) =>
		html`<span class="count${urgent ? " urgent" : ""}" title="${words}" aria-hidden="true">${n}</span><span class="sr">, ${words}</span>`;
	if (key === "support") return nav.support ? badge(nav.support, `${nav.support} waiting for an answer`) : "";
	if (key !== "insights" || !nav.alerts) return "";
	const all = `${nav.alerts} ${nav.alerts === 1 ? "alert" : "alerts"}`;
	const words = !nav.urgent ? all : nav.urgent === nav.alerts ? `${nav.alerts} urgent ${nav.alerts === 1 ? "alert" : "alerts"}` : `${all}, ${nav.urgent === 1 ? "one" : nav.urgent} urgent`;
	return badge(nav.alerts, words, nav.urgent > 0);
}

function sidebar(current: AdminNavKey, frame: AdminFrame): SafeHtml {
	const link = (n: (typeof NAV)[number]) => html`<a href="${n.href}"${n.key === current ? html` aria-current="page"` : ""}>${n.icon}<span>${n.label}</span>${count(n.key, frame.nav)}</a>`;
	return html`<header class="adminside"><div class="adminrow">
<a class="brand" href="/admin"><img src="/logo.png" alt="" width="36" height="36"><span><b>${CLUB.siteName}</b><small>Site admin</small></span></a>
<div class="admintools"><button class="themebtn" type="button" id="theme-toggle" aria-label="Switch between light and dark mode" hidden></button>
<a class="signoutbtn" href="/signout" data-signout aria-label="Sign out" title="Sign out">${ICON_DOOR}</a>${viewSwitch("desktop")}</div></div>
<nav class="adminnav" aria-label="Admin">${NAV.map(link)}</nav>
${viewSwitch("mobile")}</header>`;
}

/** `head`: the page's own actions (Teams' Onboard a team); `back`: the page it's part of (Teams, for a team's pages);
 * `lede`: a line under the title. */
export interface AdminPage {
	title: string; current: AdminNavKey; frame: AdminFrame; head?: SafeHtml; back?: { href: string; label: string }; lede?: string | SafeHtml; scripts?: string[];
	/** Stylesheets of its own, after admin.css (Documentation's diagrams). */
	styles?: string[];
}

export function adminLayout(p: AdminPage, body: SafeHtml): SafeHtml {
	const back = p.back ? html`<a class="backlink" href="${p.back.href}">‹ ${p.back.label}</a>` : "";
	return layout({ title: `Admin: ${p.title}`, frame: null, bar: sidebar(p.current, p.frame), scripts: ["/admin.js", ...(p.scripts ?? [])], styles: ["/admin.css", ...(p.styles ?? [])], bodyClass: "admin", view: true },
		html`<div class="ahead"><div class="aheadtext">${back}<h1>${p.title}</h1>${p.lede ? html`<p class="lede">${p.lede}</p>` : ""}</div>${p.head ? html`<div class="aheadacts">${p.head}</div>` : ""}</div>
<div class="adminview">${body}</div>`);
}
