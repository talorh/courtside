// The end-of-season pack, at the bottom of Manage team and folded until it's opened: before the season's videos, clips
// and photos are deleted, every game's HD video to download (and a button to get every HD copy made at once), each
// player's highlight clips under their name, the clips with no one in the squad tagged, and where to save the photos
// and the roster.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDay, formatDuration, formatShortDate } from "../../../shared/time.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Player } from "../../players/players-repository.ts";
import type { PackClip, PackGame } from "../season-pack-repository.ts";

export interface SeasonPack {
	games: PackGame[]; clips: PackClip[]; players: Player[];
	/** Who's tagged in each clip. */
	tagged: Map<number, Player[]>;
	photos: number;
	/** The last day the season's footage is kept ('YYYY-MM-DD'). */
	keptUntil: string;
	/** Open, not folded: straight after its button's been used, to show how that went. */
	open: boolean;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const when = (startsAt: string) => formatShortDate(startsAt);

function clipList(clips: PackClip[]): SafeHtml {
	return html`<ul class="packlist">${clips.map((c) => html`<li><a href="/clips/${c.id}/download">${c.label}</a><span class="small">${gameTitle(c.game)}, ${when(c.game.startsAt)}</span></li>`)}</ul>`;
}

function highlights(p: SeasonPack): SafeHtml {
	if (!p.clips.length) return html`<p class="small">No highlight clips yet.</p>`;
	const mine = (pl: Player) => p.clips.filter((c) => p.tagged.get(c.id)?.some((t) => t.id === pl.id));
	// A clip tagged only with players since taken off the squad goes with the untagged ones, so no clip is left out.
	const squad = new Set(p.players.map((pl) => pl.id));
	const untagged = p.clips.filter((c) => !p.tagged.get(c.id)?.some((t) => squad.has(t.id)));
	const each = p.players.map((pl) => ({ pl, clips: mine(pl) })).filter((x) => x.clips.length);
	return html`${each.map(({ pl, clips }) => html`<details class="packgroup"><summary>#${pl.number} ${pl.name} <span class="small">${plural(clips.length, "clip")}</span></summary>${clipList(clips)}</details>`)}
${untagged.length ? html`<details class="packgroup"><summary>No one in the squad tagged <span class="small">${plural(untagged.length, "clip")}</span></summary>${clipList(untagged)}</details>` : ""}`;
}

export function seasonPackSection(p: SeasonPack): SafeHtml {
	const games = p.games.length
		? html`<form method="post" action="/season-pack/hd" class="inline"><button class="btn">Get every HD copy ready</button></form>
<p class="small">Stream makes a game's HD copy the first time someone asks for it. This asks for every game's at once, so they're all ready to download in about 15 minutes.</p>
<details class="packgroup"><summary>Every game's video <span class="small">${plural(p.games.length, "game")}</span></summary><ul class="packlist">${p.games.map((g) => html`<li><a href="/videos/${g.videoId}/download/hd">${gameTitle(g.game)}</a><span class="small">${when(g.game.startsAt)}${g.durationSeconds ? `, ${formatDuration(g.durationSeconds)}` : ""}</span></li>`)}</ul></details>`
		: html`<p class="small">No game videos yet.</p>`;
	return html`<details class="panel seasonpack" id="season-pack"${p.open ? html` open` : ""}><summary><h2>End of season: keep it all</h2><span class="small">Everything to download before <b>${formatDay(p.keptUntil)}</b></span></summary>
<div class="stack"><p>This season's videos, clips and photos are deleted after <b>${formatDay(p.keptUntil)}</b>. Download what the team wants to keep before then: families can download any game, clip or photo themselves too.</p>
<h3>Games</h3>${games}
<h3>Each player's highlights</h3>${highlights(p)}
<h3>Photos and the roster</h3><p>${plural(p.photos, "photo")}: <a href="/photos">save ${p.photos === 1 ? "it" : "them"} on Photos</a>, each with its own Save. <a href="/roster/export.xlsx">The roster as a spreadsheet</a>.</p></div></details>`;
}
