import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDuration } from "../../../shared/time.ts";
import { thumb } from "../../../ui/components.ts";
import { starButton } from "../../favourites/views/star.ts";
import type { Member } from "../../members/members-repository.ts";
import { type Player, playerLabel } from "../../players/players-repository.ts";
import type { Clip } from "../clips-repository.ts";
import { canDeleteClip, canEditClip } from "../clips-service.ts";
import { confirmButton } from "../../../ui/confirm.ts";

export interface ClipCard {
	clip: Clip;
	thumbUrl: string | null;
	/** Who's in it, in number order. */
	players: Player[];
}

/** Tick who's in the clip: "#23 Jordan", in number order. */
function playerPicker(players: Player[], ticked: Player[] = []): SafeHtml | "" {
	if (!players.length) return "";
	const on = new Set(ticked.map((p) => p.id));
	return html`<fieldset class="choice players"><legend>Who's in it? <span class="small">(optional, tick any)</span></legend>
${players.map((p) => html`<label><input type="checkbox" name="players" value="${p.id}"${on.has(p.id) ? html` checked` : ""}> ${playerLabel(p)}</label>`)}</fieldset>`;
}

/** The maker or a team manager can change who's in a clip later. */
function editPlayers(c: ClipCard, players: Player[]): SafeHtml | "" {
	if (!players.length) return "";
	return html`<details class="askremove"><summary class="btn quiet">${c.players.length ? "Change players" : "Add players"}</summary>
<form method="post" action="/clips/${c.clip.id}/players" class="stack">${playerPicker(players, c.players)}
<button class="btn primary">Save players</button></form></details>`;
}

const length = (c: Clip) => formatDuration(c.endSeconds - c.startSeconds);

/** Ask a team manager to take a clip down (only a team manager deletes clips). */
function askToRemove(clip: Clip): SafeHtml {
	return html`<details class="askremove"><summary class="btn quiet">Ask to remove</summary>
<form method="post" action="/clips/${clip.id}/removal-requests" class="stack"><label>Reason (optional)
<input name="reason" type="text" maxlength="500" placeholder="My child shouldn't be in it"></label>
<button class="btn primary">Send request</button></form></details>`;
}

/** This member's starred clips, and the page a star goes back to. */
interface Stars { starred: Set<number>; back: string }

function clipRow(c: ClipCard, gameId: number, currentId: number | null, member: Member, players: Player[], stars: Stars): SafeHtml {
	const { clip } = c;
	const current = clip.id === currentId ? html` aria-current="true"` : "";
	const meta = html`<span class="small">${formatDuration(clip.startSeconds)} · ${length(clip)} long</span>`;
	const actions = clip.status === "ready"
		? html`<a class="btn quiet" href="/games/${gameId}?clip=${clip.id}">Watch</a><a class="btn quiet" href="/clips/${clip.id}/download" data-save-clip="${clip.id}">Download <span>MP4</span></a>${starButton(`/clips/${clip.id}/favourite`, stars.starred.has(clip.id), stars.back)}`
		: html`<span class="small">${clip.status === "failed" ? "Couldn't make this clip" : "Getting ready…"}</span>`;
	// Its maker (or a team manager) can change who's in it; only a team manager deletes it, everyone else asks.
	const edit = canEditClip(member, clip) ? editPlayers(c, players) : "";
	const remove = canDeleteClip(member)
		? confirmButton({ action: `/clips/${clip.id}/delete`, label: "Delete", question: "Delete this clip?", consequence: "It can't be brought back." }) : askToRemove(clip);
	const who = c.players.length ? html`<span class="who-in">${c.players.map((p) => html`<span class="t src">${playerLabel(p)}</span>`)}</span>` : "";
	return html`<li class="clip"${current}>${thumb(c.thumbUrl)}<div class="clipmeta"><b>${clip.label}</b>${meta}${who}
<div class="row-actions">${actions}${edit}${remove}</div></div></li>`;
}

/** Sidebar list: every member sees every clip, so highlights are made once and shared. */
export function clipsPanel(clips: ClipCard[], gameId: number, currentId: number | null, member: Member, players: Player[], stars: Stars): SafeHtml {
	const empty = html`<p class="small">No clips yet. Someone's got to start the highlight reel: use “Make a highlight clip” under the video.</p>`;
	// On an iPhone or iPad, Download becomes Save, through the share menu (public/video-save.js says so here). Only once
	// there's a clip to save (the note read oddly above "No clips yet").
	const hint = clips.length ? html`<p class="small" data-save-clip-hint hidden></p>
` : "";
	return html`<div class="panel clips"><div class="eyebrow">Highlight clips</div>${hint}${clips.length ? html`<ul class="cliplist">${clips.map((c) => clipRow(c, gameId, currentId, member, players, stars))}</ul>` : empty}</div>`;
}

/** Clip maker (any member). Works by typing times; watch.js adds Mark buttons that read the player's position. */
export function clipMaker(videoId: number, players: Player[]): SafeHtml {
	const time = (name: string, label: string) => html`<label>${label}<span class="markrow">
<input name="${name}" id="clip-${name}" type="text" inputmode="numeric" placeholder="m:ss" pattern="[0-9:]{1,8}" required>
<button class="btn quiet mark" type="button" data-mark="clip-${name}" hidden>Mark ${name}</button></span></label>`;
	return html`<details class="panel" open><summary class="eyebrow">Make a highlight clip</summary>
<form method="post" action="/videos/${videoId}/clips" class="clipmaker">
<p class="small">Play the game, tap <b>Mark start</b> at the moment, then <b>Mark end</b>. Or type the times. Clips are 3 seconds to 5 minutes, and everyone in the team can watch and download them. Tick who's in it for their end-of-season reel. To have one taken down, tap Ask to remove under it.</p>
<div class="clipgrid">${time("start", "Start")}${time("end", "End")}</div>
<label>Label<input name="label" type="text" maxlength="80" placeholder="Q4, the comeback"></label>
${playerPicker(players)}
<button class="btn primary">Save clip</button></form></details>`;
}
