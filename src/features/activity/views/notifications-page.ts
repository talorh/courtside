import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Game } from "../../games/games-repository.ts";
import type { ActivityEntry, ActivityKind } from "../activity-repository.ts";

export interface InProgress {
	game: Game | null;
	stage: "live" | "uploading" | "processing" | "hd";
	since: string;
}

export interface NotificationsProps {
	frame: PageFrame;
	inProgress: InProgress[];
	activity: ActivityEntry[];
	games: Map<number, Game>;
	openRemovals: number;
}

/** Each stage in words (the admin area's Log says it the same way). */
export const STAGE: Record<InProgress["stage"], string> = {
	live: "Live stream: streaming now (or paused), or saving after End game",
	uploading: "Uploading from a parent's phone or computer",
	processing: "Uploaded, now being processed (about 20 to 25 minutes)",
	hd: "Ready to watch; HD MP4 download still being made (about 10 to 15 minutes after it's ready to watch)",
};

export const WHAT: Record<ActivityKind, string> = {
	upload_started: "started uploading", upload_finished: "finished uploading", video_ready: "Ready to watch",
	video_failed: "Video couldn't be processed", hd_ready: "HD MP4 download ready", clip_made: "made a highlight clip",
	removal_requested: "asked for the video to be removed", clip_removal_requested: "asked for a highlight clip to be removed",
	live_started: "went live", live_saved: "Live stream saved as the game video", photo_removal_requested: "asked for a photo to be removed",
	video_deleted: "deleted the video", game_deleted: "deleted the game",
};

const when = (iso: string) => formatGameDate(localTime(new Date(iso)));

function gameLink(game: Game | null | undefined): SafeHtml {
	return game ? html`<a href="/games/${game.id}">${gameTitle(game)}</a>` : html`<span>a deleted game</span>`;
}

/** What a line says after its game (who did it, what, and their words), and whether it's one to look at (warn). */
export function said(a: Pick<ActivityEntry, "kind" | "memberName" | "detail">): { text: SafeHtml; warn: boolean } {
	const who = a.memberName && !["video_ready", "video_failed", "hd_ready", "live_saved"].includes(a.kind) ? html`<b>${a.memberName}</b> ` : "";
	const detail = a.detail ? html` <span class="small">“${a.detail}”</span>` : "";
	return { text: html`${who}${WHAT[a.kind]}${detail}`, warn: ["removal_requested", "clip_removal_requested", "photo_removal_requested", "video_failed", "video_deleted", "game_deleted"].includes(a.kind) };
}

function entry(a: ActivityEntry, games: Map<number, Game>): SafeHtml {
	const { text, warn } = said(a);
	const tone = warn ? " warn" : "";
	// Photos aren't a game's: a photo's line links to Photos.
	const where = a.kind === "photo_removal_requested" ? html`<a href="/photos">Photos</a>` : gameLink(a.gameId === null ? null : games.get(a.gameId));
	return html`<li class="feed${tone}"><span class="small mono">${when(a.createdAt)}</span>
<span>${where}: ${text}</span></li>`;
}

export function notificationsPage(p: NotificationsProps): SafeHtml {
	const removals = p.openRemovals
		? html`<div class="note warn" role="status">${p.openRemovals} open removal request${p.openRemovals === 1 ? "" : "s"}. <a href="/manage#removals">Review on Manage team</a>.</div>`
		: "";
	const live = p.inProgress.length
		? html`<ul class="feedlist">${p.inProgress.map((i) => html`<li class="feed"><span class="small mono">since ${when(i.since)}</span><span>${gameLink(i.game)}: ${STAGE[i.stage]}</span></li>`)}</ul>`
		: html`<p class="small">Nothing streaming, uploading or processing right now.</p>`;
	const feed = p.activity.length
		? html`<ul class="feedlist">${p.activity.map((a) => entry(a, p.games))}</ul>`
		: html`<p class="small">Nothing in the last 30 days.</p>`;
	return layout({ title: "Notifications", frame: p.frame, current: "notifications", refreshSeconds: 120 }, html`${pageHead("Team managers", "Notifications")}
${removals}<p class="small">Live streams, uploads, processing, HD downloads, clips and removal requests. This page refreshes every 2 minutes.</p>
<section class="panel stack"><h2>In progress</h2>${live}</section>
<section class="panel stack"><h2>Last 30 days</h2>${feed}</section>`);
}
