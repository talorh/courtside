import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatShortDate } from "../../../shared/time.ts";
import { notice } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { GameWithVideo } from "../../games/games-repository.ts";
import { isFree } from "../../games/games-service.ts";
import { teamCopy } from "../../teams/team-copy.ts";

/** One video per game. A game with no video (or a failed one) is free; one with an unfinished upload can be resumed.
 * Only these are listed (`games`, in the order to show them). */
export const canUploadTo = (r: GameWithVideo) => isFree(r) || r.videoStatus === "uploading";

const UPLOAD_TIPS = html`<details class="panel tips" open><summary>Upload tips</summary><ol class="steps">
<li><b>One video of the whole game</b>, not one per quarter.</li>
<li><b>iPhone: save the video to Files first.</b> In Photos, tap Share → Save to Files. Then here, tap Choose the video → Choose File and pick it from Files. Picked from Photos instead, the iPhone converts the whole game first: many minutes' wait.</li>
<li><b>Use home Wi-Fi and keep this page open</b> until it says done (about 25 minutes for a full game). If the page reloads, pick the same game and video again: it carries on.</li></ol>
<p class="small">More help: <a href="/help#record-iphone">iPhone</a> or <a href="/help#record-android">Android</a> in Help.</p></details>`;

function option(r: GameWithVideo, selectedId: number | null): SafeHtml {
	const label = `${formatShortDate(r.game.startsAt)} · vs ${r.game.opponent}`;
	const note = r.videoStatus === "uploading" ? " (upload in progress, pick to carry on)" : "";
	return html`<option value="${r.game.id}"${r.game.id === selectedId ? html` selected` : ""}>${label}${note}</option>`;
}

export function uploadPage(p: { frame: PageFrame; games: GameWithVideo[]; selectedId: number | null }): SafeHtml {
	const { ask } = teamCopy(p.frame.team);
	const body = p.games.length === 0
		? notice(`There's no game waiting for its video. Ask ${ask} to add the game to the Fixture first.`, "warn")
		: html`<form class="panel" id="upload">
<div class="step done"><span class="n" aria-hidden="true">1</span><label for="game">Which game?
<select id="game">${p.games.map((r) => option(r, p.selectedId))}</select>
<span class="small">The latest game without a video is picked for you. Each game has one video; to replace one, ask ${ask}.</span></label></div>
<div class="step"><span class="n" aria-hidden="true">2</span><div class="stack">
<label class="btn primary bigpick filepick" id="pick"><span id="pick-text">Choose the video</span><input id="file" type="file" accept="video/*"></label>
<span class="small">Pick it from your phone or computer.</span>
<span class="small drop-hint">On a computer you can also drag the video file onto this box.</span></div></div>
<div class="file" id="progress" hidden><div class="row"><b id="file-name"></b><span class="small" id="pct"></span></div>
<div class="prog"><i id="bar"></i></div><span class="small" id="hint" role="status"></span>
<span class="small warn" id="awake" hidden>Your phone may lock its screen, which pauses the upload. Tap anywhere on this page once to keep the screen on. Still locking? Set Auto-Lock to Never until it's done (iPhone: Settings → Display &amp; Brightness → Auto-Lock).</span>
<button class="btn quiet" type="button" id="cancel" hidden>Cancel upload</button></div>
<p class="done-note" id="done-note" hidden>Upload complete. Nothing but net! Thank you! The game will be ready to watch in Watch games in about 20 to 25 minutes, once it has been processed. You can close this page.</p>
</form>`;
	return layout({ title: "Upload", frame: p.frame, current: "upload", scripts: ["/upload.js"] }, html`<div class="uphero">
<div><div class="eyebrow">Filmed a game? Upload it here</div><h1>Upload game video</h1></div>${body}${UPLOAD_TIPS}</div>`);
}
