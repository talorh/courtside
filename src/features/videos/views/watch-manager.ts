// The game page's Team manager panel: a failed video's reason, Keep the first part for a carried-on stream whose parts
// couldn't be joined, moving a ready video to another game, and deleting it.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate } from "../../../shared/time.ts";
import { selectOptions } from "../../../ui/components.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Game } from "../../games/games-repository.ts";
import type { Video } from "../videos-repository.ts";

export function managerActions(v: Video, moveTargets: Game[]): SafeHtml {
	const targets = moveTargets.map((g) => ({ value: String(g.id), label: `${formatGameDate(g.startsAt)} · ${gameTitle(g)}` }));
	const failure = v.status === "failed"
		? html`<p class="small">Stream said: ${v.failureReason ?? "unknown error"}. Delete it so the game can be uploaded again.</p>` : "";
	// A carried-on stream whose parts the joiner gave up on (live/join-service.ts): the first part can stand as the video.
	const unjoined = v.joinFailedAt
		? html`<p class="small">This game was streamed in parts (the page closed mid-game) and the parts couldn't be joined. Keep the first part as the game's video, or delete it and upload the game instead.</p>
${confirmButton({ action: `/videos/${v.id}/keep-first`, label: "Keep the first part", question: "Keep only the first part?", consequence: "The later parts are deleted, and the first is processed as the game's video." })}` : "";
	const move = targets.length && v.status === "ready"
		? html`<form method="post" action="/videos/${v.id}/move"><label>Move to another game<select name="gameId">${selectOptions(targets)}</select></label>
<button class="btn">Move video</button></form>` : "";
	return html`<div class="panel"><div class="eyebrow">Team manager</div>${failure}${unjoined}${move}${confirmButton({ action: `/videos/${v.id}/delete`, label: "Delete video", question: "Delete this game's video?", consequence: "It's kept for 24 hours in case it was a mistake, then it's gone for good.", summaryClass: "btn" })}</div>`;
}

