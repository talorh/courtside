import { hasRole } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatClock, formatShortDate } from "../../../shared/time.ts";
import { notice, pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Member } from "../../members/members-repository.ts";
import type { Credit } from "../roster-away.ts";
import { dutiesOn, dutyLabel, dutySentence, dutyWords, type RosterDuties } from "../roster-duties.ts";
import { DUTIES, type Duty, type Slot, slotsFor, type Wanted } from "../roster-plan.ts";
import type { RosterFamily } from "../roster-repository.ts";
import { dutiesFor, needOf, type RosterWeek } from "../roster-service.ts";
import { dutiesPanel, familiesPanel, weekEditor } from "./roster-admin.ts";
import { rosterDashboard } from "./roster-dashboard.ts";
import { teamCopy } from "../../teams/team-copy.ts";

export const ROSTER_MESSAGES: Record<string, string> = {
	generated: "Roster generated for the upcoming weeks.", added: "Families added.", removed: "Family taken off. Their upcoming duties went to others.",
	saved: "Week saved.", novideo: "No video this week: its games are marked No video.", video: "Video is back on for this week.",
	scorersonly: "Scorers only this week: just the two scorers, and its games are marked No video.", allduties: "All duties are back on for this week.",
	duties: "Duties saved. The roster follows them from this week on.",
};

export interface RosterPageProps {
	frame: PageFrame;
	weeks: RosterWeek[];
	slots: Slot[];
	families: RosterFamily[];
	/** Every family's surname, removed ones included. */
	names: Map<number, string>;
	fair: Map<number, Record<Duty | "total", number>>;
	/** Each family's time off the roster, counted as its share of those weeks (roster-away.ts). */
	away: Map<number, Credit>;
	/** The team's duties (lollies and video can be off); weeks before this one keep every duty. */
	duties: RosterDuties;
	thisWeek: string;
	season: string;
	message: string | null;
}

/** The family whose surname is the member's last name, if any ("Sam Smith" → Smith). */
const familyOf = (member: Member, families: RosterFamily[]) => {
	const last = member.name.trim().split(/\s+/).at(-1)?.toLowerCase();
	return families.find((f) => f.surname.toLowerCase() === last) ?? null;
};

// The next six weeks (this one included) show; later ones fold away under Later weeks, as a season runs to 40 or more.
const UPCOMING_SHOWN = 6;

/** "Sat 31 Oct, 9:00am": a game of a weekend with several, to say which one a scoring slot is for. */
export const gameWhen = (w: RosterWeek, gameId: number) => {
	const g = w.games.find((x) => x.game.id === gameId)?.game;
	return g ? `${formatShortDate(g.startsAt)}, ${formatClock(g.startsAt.slice(11))}` : "";
};

/** "Set by hand: Scoring 1 (Sat 31 Oct, 9:00am), Video." for the team manager, when some of the week's duties are. */
function setByHand(w: RosterWeek, held: Slot[], duties: RosterDuties): SafeHtml | "" {
	const label = (s: Slot) => `${dutyLabel(s.duty, duties)}${s.duty === "scoring" ? ` ${s.position}` : ""}${w.games.length > 1 && s.gameId ? ` (${gameWhen(w, s.gameId)})` : ""}`;
	const hand = held.filter((s) => s.byHand).sort((a, b) => DUTIES.indexOf(a.duty) - DUTIES.indexOf(b.duty) || a.gameId - b.gameId || a.position - b.position).map(label);
	return hand.length ? html`<p class="small duty-hand">Set by hand: ${hand.join(", ")}.</p>` : "";
}

function weekCard(p: RosterPageProps, w: RosterWeek, mine: number | null): SafeHtml {
	const held = p.slots.filter((s) => s.week === w.week);
	const name = (x: Wanted) => {
		const s = held.find((h) => h.duty === x.duty && h.position === x.position && h.gameId === x.gameId);
		return s ? html`<span class="${s.familyId === mine ? "duty-fam mine" : "duty-fam"}">${p.names.get(s.familyId) ?? "?"}</span>` : html`<span class="duty-fam empty">Not set</span>`;
	};
	const has = dutiesFor(w.week, p.thisWeek, p.duties);
	const wanted = slotsFor(needOf(w), has);
	const names = (xs: Wanted[]) => xs.map((x, i) => html`${i ? ", " : ""}${name(x)}`);
	// A weekend with several games: each game's own duties sit under that game; below them, what the weekend has none
	// of (No lollies, No video).
	const perGame = w.games.length > 1;
	const dutyRow = (duty: Duty, xs: Wanted[]) => {
		const none = duty === "video" ? "No video" : `No ${dutyLabel(duty, p.duties).toLowerCase()}`;
		return html`<div class="duty"><span class="duty-name">${dutyLabel(duty, p.duties)}</span><span class="duty-fams">${xs.length ? names(xs) : html`<span class="duty-fam empty">${none}</span>`}</span></div>`;
	};
	const weekDuties = dutiesOn(has).flatMap((duty) => {
		if (!perGame) return [dutyRow(duty, wanted.filter((x) => x.duty === duty))];
		return wanted.some((x) => x.duty === duty) ? [] : [dutyRow(duty, [])];
	});
	const gameDuties = (gameId: number) => (perGame ? dutiesOn(has).flatMap((duty) => {
		const xs = wanted.filter((x) => x.duty === duty && x.gameId === gameId);
		return xs.length ? [html`<div class="duty"><span class="duty-name">${dutyLabel(duty, p.duties)}</span><span class="duty-fams">${names(xs)}</span></div>`] : [];
	}) : "");
	const now = w.week === p.thisWeek ? html` <span class="role c">This week</span>` : "";
	const admin = p.frame.member.role === "manager" && p.frame.team.status === "active";
	// The game (or each game, for a tournament weekend) is the heading: when, who against, and where (once, when a
	// weekend's games share a venue).
	const venue = (i: number) => (w.games[i]!.game.venue && w.games[i]!.game.venue !== w.games[i - 1]?.game.venue ? html`<span class="small">${w.games[i]!.game.venue}</span>` : "");
	return html`<li class="panel duty-week" id="w${w.week}"><ul class="duty-games">${w.games.map(({ game }, i) => html`<li><b>${formatShortDate(game.startsAt)}, ${formatClock(game.startsAt.slice(11))} · ${gameTitle(game)}</b>${i === 0 ? now : ""}
${venue(i)}${game.noVideo ? html`<span class="small">No video</span>` : ""}${gameDuties(game.id)}</li>`)}</ul>
<div class="duties">${weekDuties}</div>${admin ? setByHand(w, held, p.duties) : ""}${admin ? weekEditor(w, held, p.families, p.names, has) : ""}</li>`;
}

/** Roster: who's on each of the team's duties each week, and how fair it is. The team manager runs it. */
export function rosterPage(p: RosterPageProps): SafeHtml {
	const mine = familyOf(p.frame.member, p.families);
	const upcoming = p.weeks.filter((w) => w.week >= p.thisWeek), earlier = p.weeks.filter((w) => w.week < p.thisWeek).reverse();
	const later = upcoming.slice(UPCOMING_SHOWN);
	const next = mine ? p.slots.find((s) => s.familyId === mine.id && s.week >= p.thisWeek) : undefined;
	// On a weekend with several games, which game it's at.
	const nextWeek = next ? p.weeks.find((w) => w.week === next.week) : undefined;
	const at = next && nextWeek && nextWeek.games.length > 1 && next.gameId ? ` at the ${gameWhen(nextWeek, next.gameId)} game` : "";
	const yours = mine ? notice(next ? `Your family (${mine.surname}) is on ${dutyLabel(next.duty, p.duties).toLowerCase()}${at} in the week of ${formatShortDate(`${next.week}T00:00`)}.` : `Your family (${mine.surname}) has no upcoming duties.`) : "";
	const empty = !p.slots.length ? html`<p class="small">${p.frame.member.role === "manager" ? "Add the families below, then tap Generate roster." : `The roster isn't out yet. ${teamCopy(p.frame.team).Ask} will post it here.`}</p>` : "";
	const words = dutyWords(p.duties);
	return layout({ title: "Roster", frame: p.frame, current: "roster", scripts: p.frame.member.role === "manager" && p.frame.team.status === "active" ? ["/roster.js", "/rows.js"] : ["/roster.js"] }, html`${pageHead(words.charAt(0).toUpperCase() + words.slice(1), "Roster")}
${notice(p.message)}${yours}
<p class="small">${dutySentence(p.duties, p.names)}${p.duties.video ? html`, unless filming isn't allowed` : ""}.${p.duties.lollies ? html` A tournament weekend starts as scorers only.` : ""} Can't make it? Swap with another family, then let ${teamCopy(p.frame.team).ask} know.</p>
${hasRole(p.frame.member.role, "filmer") ? html`<div class="row-actions"><a class="btn" href="/roster/export.xlsx">Export to Excel</a></div>` : ""}
${empty}${upcoming.length ? html`<ol class="duty-weeks">${upcoming.slice(0, UPCOMING_SHOWN).map((w) => weekCard(p, w, mine?.id ?? null))}</ol>` : html`<p>No upcoming games in the fixture.</p>`}
${later.length ? html`<details class="panel duty-later"><summary>Later weeks (${later.length})</summary><ol class="duty-weeks">${later.map((w) => weekCard(p, w, mine?.id ?? null))}</ol></details>` : ""}
${earlier.length ? html`<details class="panel"><summary>Earlier weeks</summary><ol class="duty-weeks">${earlier.map((w) => weekCard(p, w, mine?.id ?? null))}</ol></details>` : ""}
${p.frame.member.role === "manager" && p.frame.team.status === "active" ? html`${dutiesPanel(p.duties, p.families)}${familiesPanel(p.families)}` : ""}
${rosterDashboard({ Ask: teamCopy(p.frame.team).Ask, season: p.season, thisWeek: p.thisWeek, weeks: p.weeks, slots: p.slots, names: p.names, fair: p.fair, away: p.away, duties: p.duties, active: new Set(p.families.map((f) => f.id)), canGenerate: p.frame.member.role === "manager" })}`);
}
