import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatClock, formatDay, formatDuration } from "../../../shared/time.ts";
import { thumb } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { StarredClip } from "../../favourites/favourites-repository.ts";
import { liveCards } from "../../live/views/live-card.ts";
import type { Score } from "../../scores/scores-repository.ts";
import { scoreSwitch, scoreTag } from "../../scores/views/score-line.ts";
import { gamePhase, gameTitle } from "../game-format.ts";
import { competitionTags } from "./phase-tag.ts";
import type { Competition, Game } from "../games-repository.ts";
import type { LibraryEntry } from "../library-repository.ts";
import { teamCopy } from "../../teams/team-copy.ts";

export type LibraryCard = LibraryEntry & { thumbUrl: string | null };
export type FavouriteClip = StarredClip & { thumbUrl: string | null };

interface LibraryPageProps {
	frame: PageFrame;
	entries: LibraryCard[];
	competition: Competition | "";
	/** Competitions that have games to watch; the filter only offers these. */
	competitions: Competition[];
	live: Game[];
	/** local wall-clock now, to tell upcoming games from past ones. */
	nowLocal: string;
	/** "2026/27" */
	season: string;
	/** Games whose live stream was stopped and is being saved. */
	saving: Set<number>;
	/** Games being live streamed (or paused) right now. */
	streaming: Set<number>;
	/** Final scores, by game (not shown to a member who hides scores). */
	scores: Map<number, Score>;
	/** This member's favourites: starred games, as cards, and highlight clips, as rows. */
	favourites: { games: LibraryCard[]; clips: FavouriteClip[] };
}

type CardState = "ready" | "live" | "processing" | "upcoming" | "playing" | "waiting" | "novideo";

/** Where a game is at, so each kind of card looks different at a glance: [state, label]. */
function stateOf(e: LibraryCard, p: LibraryPageProps): [CardState, string] {
	if (e.streamUid) return ["ready", "Ready to watch"];
	if (p.streaming.has(e.game.id)) return ["live", "Live stream"];
	if (p.saving.has(e.game.id)) return ["processing", "Saving live stream"];
	if (e.videoStatus === "uploading") return ["processing", "Uploading"];
	if (e.videoStatus === "processing") return ["processing", "Processing"];
	if (e.game.noVideo) return ["novideo", "No video"];
	const phase = gamePhase(e.game.startsAt, p.nowLocal, p.scores.has(e.game.id));
	return phase === "upcoming" ? ["upcoming", "Upcoming"] : phase === "in_progress" ? ["playing", "In progress"] : ["waiting", "Waiting for video"];
}

function card(e: LibraryCard, p: LibraryPageProps): SafeHtml {
	const [state, label] = stateOf(e, p);
	const dur = e.durationSeconds ? html`<span class="dur">${formatDuration(e.durationSeconds)}</span>` : "";
	const pic = e.streamUid ? thumb(e.thumbUrl, dur) : html`<div class="thumb court"><img src="/court.webp" alt="" loading="lazy"></div>`;
	const soon = state === "processing" ? html`<span class="soon">Ready to watch soon</span>` : "";
	return html`<a class="game s-${state}" href="/games/${e.game.id}">${pic}
<div class="gmeta"><span class="gstate"><i aria-hidden="true"></i>${label}</span>${soon}<h3>${gameTitle(e.game)}</h3><div class="tags">${e.isNew ? html`<span class="t new">New</span>` : ""}${competitionTags(e.game)}${scoreTag(p.scores.get(e.game.id), p.frame.member.hideScores)}${state === "upcoming" ? html`<span class="t src">${e.game.liveStream ? "Live stream" : "Recorded"}</span>` : ""}</div><div class="sub">${e.game.venue}</div></div>
<div class="when">${formatDay(e.game.startsAt)}<span class="clock">${formatClock(e.game.startsAt.slice(11, 16))}</span></div></a>`;
}

/** A starred clip: opens the clip on its game's page. */
const favClip = (c: FavouriteClip) => html`<a class="favclip" href="/games/${c.game.id}?clip=${c.clipId}">${thumb(c.thumbUrl)}
<div class="clipmeta"><b>${c.label}</b><span class="small">${gameTitle(c.game)} · ${formatDuration(c.endSeconds - c.startSeconds)} long</span></div></a>`;

/** Your favourites, above every game (nothing when there are none), then the season's games under All games. */
function favourites(p: LibraryPageProps): SafeHtml | "" {
	const { games, clips } = p.favourites;
	if (!games.length && !clips.length) return "";
	return html`<section class="favs" aria-labelledby="favs-h"><h2 id="favs-h">Your favourites</h2>
${games.length ? html`<div class="games">${games.map((e) => card(e, p))}</div>` : ""}${clips.length ? html`<div class="favclips">${clips.map(favClip)}</div>` : ""}</section>
<h2 class="allhead">All games</h2>`;
}

const libraryHref = (competition: string) => (competition ? `/games?c=${encodeURIComponent(competition)}` : "/games");

/** Competition filter: plain links, so they work without JS. There's no search; a season is only a few dozen games. */
function chips(p: LibraryPageProps): SafeHtml | "" {
	if (p.competitions.length === 0) return "";
	const options: Array<{ value: Competition | ""; label: string }> = [{ value: "", label: "All" }, ...p.competitions.map((c) => ({ value: c, label: c }))];
	return html`<nav class="chips" aria-label="Competition">${options.map((o) =>
		html`<a class="chip" href="${libraryHref(o.value)}" aria-current="${o.value === p.competition ? "true" : "false"}">${o.label}</a>`)}</nav>`;
}

export function libraryPage(p: LibraryPageProps): SafeHtml {
	const empty = p.competition ? "No games in this competition yet." : "No games yet. The court's quiet, for now.";
	return layout({ title: "Games", frame: p.frame, current: "games", scripts: ["/thumbs.js", "/games-refresh.js"] }, html`
<div class="libhead"><div><div class="eyebrow">${teamCopy(p.frame.team).long.replace(`${CLUB.name} `, "")} · Season ${p.season}</div><h1>Game footage</h1></div>
<div class="libtools">${chips(p)}${p.scores.size ? scoreSwitch(p.frame.member.hideScores, libraryHref(p.competition)) : ""}</div></div>${liveCards(p.live)}${favourites(p)}
<div class="games">${p.entries.length ? p.entries.map((e) => card(e, p)) : html`<p class="small">${empty}</p>`}</div>`);
}
