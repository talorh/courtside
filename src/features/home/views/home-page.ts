import { films } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDay, formatGameDate } from "../../../shared/time.ts";
import { ICON_BELL, ICON_CALENDAR, ICON_HELP, ICON_PEOPLE, ICON_PHOTO, ICON_PLAY, ICON_ROSTER, ICON_UPLOAD } from "../../../ui/icons.ts";
import { layout, navFor, type NavKey, type PageFrame } from "../../../ui/layout.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Game } from "../../games/games-repository.ts";
import { LIVE_DOT, liveCards } from "../../live/views/live-card.ts";
import type { Player } from "../../players/players-repository.ts";
import { jersey } from "../../players/views/jersey.ts";
import type { Score } from "../../scores/scores-repository.ts";
import { scoreTag } from "../../scores/views/score-line.ts";
import { teamCopy } from "../../teams/team-copy.ts";

interface HomePageProps {
	frame: PageFrame;
	/** Newest game with a watchable video, if any. */
	latest: Game | null;
	/** Whether this member hasn't opened the latest game yet. */
	latestIsNew: boolean;
	/** The latest game's final score, if it has one. */
	latestScore: Score | null;
	/** Games with a video this member hasn't opened yet (see NEW_FOR_DAYS). */
	newCount: number;
	/** Games streaming live right now. */
	live: Game[];
	/** The squad, in number order, shown as singlets at the bottom. */
	players: Player[];
	/** The last day the season's videos and photos are kept ('YYYY-MM-DD'), once it's under 60 days off; else null. */
	deletesAfter: string | null;
	/** The soonest game still to come, for the computer's Coming up card (a phone has the Fixture a tap away). */
	next: Game | null;
}

// Smaller buttons under the two main ones, in this order; who sees each comes from the top bar's table (navFor).
const MORE: Partial<Record<NavKey, SafeHtml>> = {
	roster: ICON_ROSTER, fixture: ICON_CALENDAR, photos: ICON_PHOTO, manage: ICON_PEOPLE, notifications: ICON_BELL, help: ICON_HELP,
};
const MORE_ORDER: NavKey[] = ["roster", "fixture", "photos", "manage", "notifications", "help"];

/** Landing page after sign-in: the court, the one or two things people come here to do, and the squad. On a computer
 * (desktop.css) the same pieces become a banner, a main column (the buttons, the latest game, what's coming up) beside
 * a column of links, and the squad in a row; the groups here are display:contents on a phone, which puts the latest
 * game after the links as it always has (app.css), so its view is unchanged. */
export function homePage(p: HomePageProps): SafeHtml {
	// Upload and Go live for those who film (everyone but Watch only), while the season's on.
	const canUpload = films(p.frame.member.role) && p.frame.team.status === "active";
	const latest = p.latest
		? html`<a class="panel latest" href="/games/${p.latest.id}"><span class="eyebrow">Latest game${p.latestIsNew ? html` <span class="t new">New</span>` : ""}</span>
<b>${gameTitle(p.latest)}</b><span class="small">${formatGameDate(p.latest.startsAt)} ${scoreTag(p.latestScore, p.frame.member.hideScores)}</span><span class="go">Watch ▶</span></a>`
		: "";
	const open = new Map(navFor(p.frame.member.role).map((i) => [i.key, i]));
	const more = MORE_ORDER.flatMap((key) => { const i = open.get(key); return i ? [{ ...i, icon: MORE[key] }] : []; });
	const goes = p.deletesAfter
		? html`<p class="note warn" role="status">This season's videos and photos go after <b>${formatDay(p.deletesAfter)}</b>. Download any you'd like to keep before then.${p.frame.member.role === "manager" ? html` <a href="/manage#season-pack">The end-of-season pack</a> on Manage team has them all.` : ""}</p>` : "";
	const next = p.next
		? html`<a class="panel next deskonly" href="/fixture"><span class="eyebrow">Coming up</span><b>${gameTitle(p.next)}</b><span class="small">${formatGameDate(p.next.startsAt)}${p.next.venue ? html` · ${p.next.venue}` : ""}</span><span class="go">Fixture ▶</span></a>`
		: "";
	return layout({ title: "Home", frame: p.frame }, html`<div class="home">${liveCards(p.live)}${goes}
<div class="homehero"><img class="homecourt" src="/court.webp" alt="A basketball court with the club's logo at centre court" width="1600" height="900">
<div class="homehead"><div class="eyebrow">${teamCopy(p.frame.team).long}</div></div></div>
<div class="homemain"><div class="homeactions">${canUpload ? html`<a class="btn primary bigpick" href="/upload">${ICON_UPLOAD}Upload a game video</a><a class="btn livebtn bigpick" href="/live">${LIVE_DOT}Go live</a>` : ""}
<a class="btn bigpick watchbtn" href="/games">${ICON_PLAY}Watch games${p.newCount ? html`<span class="newcount">${p.newCount} new</span>` : ""}</a></div>
${latest}${next}</div>
<div class="homeside">${more.length ? html`<div class="homemore">${more.map((m) => html`<a class="btn" href="${m.href}">${m.icon}${m.label}</a>`)}</div>` : ""}</div>
${p.players.length ? html`<section class="squad"><h2>The squad</h2><ul class="squadlist">${p.players.map((pl) => html`<li>${jersey(pl)}<span class="pname">${pl.name} #${pl.number}</span></li>`)}</ul></section>` : ""}</div>`);
}
