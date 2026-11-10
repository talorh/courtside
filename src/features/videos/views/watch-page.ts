import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatClock, localTime } from "../../../shared/time.ts";
import { films } from "../../../auth/permissions.ts";
import { notice } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { Clip } from "../../clips/clips-repository.ts";
import { type ClipCard, clipMaker, clipsPanel } from "../../clips/views/clips-panel.ts";
import { starButton } from "../../favourites/views/star.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Game } from "../../games/games-repository.ts";
import { type Player, playerLabel } from "../../players/players-repository.ts";
import type { Video } from "../videos-repository.ts";
import { type GameResult, gameDetails } from "./game-details.ts";
import { type LiveView, livePlayer, liveRefreshSeconds } from "./live-player.ts";
import { managerActions } from "./watch-manager.ts";
import { askWho, teamCopy } from "../../teams/team-copy.ts";
import type { Team } from "../../teams/team.ts";

/** The game page's messages after a change (`?done=`), in the team's words. */
export const watchMessages = (team: Team): Record<string, string> => ({
	moved: "Video moved to this game.", deleted: "Video deleted. The files are kept for 24 hours in case it was a mistake.", removal: `Thanks. ${teamCopy(team).Ask} will look at your request.`,
	clip: "Clip saved. It'll be ready to watch in a minute or two.", clipdeleted: "Clip deleted.",
	clipremoval: `Thanks. ${teamCopy(team).Ask} will look at your request to remove the clip.`, clipplayers: "Players saved.",
	note: "Note saved.", notedeleted: "Note deleted.", score: "Score saved.", scorecleared: "Score cleared.",
	kept: "The first part was kept as the game's video: it's being processed.",
});

export interface WatchPageProps {
	frame: PageFrame;
	game: Game;
	video: Video | null;
	/** When a processing video's stream stopped or upload finished (ISO), for the card's "usually ready by". */
	processingSince: string | null;
	playerSrc: string | null;
	moveTargets: Game[];
	message: string | null;
	clips: ClipCard[];
	players: Player[];
	/** The clip being watched instead of the full game (`?clip=`), if any. */
	currentClip: Clip | null;
	/** Coaches' private notes panel; empty for everyone else. */
	coachNotes: SafeHtml | "";
	/** Set while the game is streaming (or about to): signed player for the live input. */
	live: LiveView | null;
	/** The game hasn't been played yet. */
	upcoming: boolean;
	/** The last live stream of this game wasn't saved, and why (e.g. too short). */
	liveNote: string | null;
	result: GameResult;
	/** The game's line under its title (game-blurb.ts). */
	blurb: string;
	/** Team managers, once the game has started: the final score form; empty for everyone else. */
	scoreForm: SafeHtml | "";
	/** This member's favourites: the game itself, and which of its clips. */
	stars: { game: boolean; clips: Set<number> };
}

// Uploading or processing: a pulsing card over the court, so it's clear the video is on its way (the page refreshes).
// Processing has taken 18 to 26 minutes on real games, so the card says about 25 and names the time.
export const PROCESSING_MINUTES = 25;
const clock = (iso: string) => formatClock(localTime(new Date(iso)).slice(11));
function onItsWay(v: Video | null, since: string | null): [string, string] | null {
	if (v?.status === "uploading") return ["Uploading", "The video is still uploading. Processing starts as soon as it's in."];
	if (v?.status !== "processing") return null;
	if (!since) return ["Processing", `The video is being processed: usually about ${PROCESSING_MINUTES} minutes. This page checks by itself.`];
	const ready = new Date(Date.parse(since) + PROCESSING_MINUTES * 60_000).toISOString();
	return ["Processing", `Processing since ${clock(since)}. It's usually ready by about ${clock(ready)}; this page checks by itself.`];
}
const isOnItsWay = (v: Video | null) => v?.status === "uploading" || v?.status === "processing";

function player(p: WatchPageProps): SafeHtml {
	if (!p.playerSrc && p.live) return livePlayer(p.live);
	const coming = onItsWay(p.video, p.processingSince);
	if (!p.playerSrc && coming) {
		return html`<div class="player"><img class="courtimg" src="/court.webp" alt=""><div class="pendcard" role="status">
<span class="pstate"><i aria-hidden="true"></i>${coming[0]}</span><p>${coming[1]}</p></div></div>`;
	}
	if (!p.playerSrc && p.video?.status === "failed") {
		// As big as the cards above, so nobody misses it, and it says the alert's raised: the admins have a ticket for it.
		return html`<div class="player"><img class="courtimg" src="/court.webp" alt=""><div class="pendcard failed" role="status">
<span class="pstate"><i aria-hidden="true"></i>Couldn't be processed</span><p>This video couldn't be processed. An alert has been raised.</p></div></div>`;
	}
	if (!p.playerSrc) {
		const text = p.video ? "No video yet."
			: p.game.noVideo ? "There's no video of this game."
			: p.upcoming ? (p.game.liveStream ? "Upcoming. It'll be live streamed here, then saved here after the game." : "Upcoming. It's being recorded: the video will be here after the game.")
			: "No video for this game yet.";
		return html`<div class="player"><img class="courtimg" src="/court.webp" alt=""></div><p class="small">${text}</p>`;
	}
	const resume = p.video && !p.currentClip ? html` data-resume="${p.video.id}"` : "";
	return html`<div class="player"><iframe src="${p.playerSrc}" allow="autoplay; fullscreen; picture-in-picture" title="${p.currentClip ? "Highlight clip" : "Game video"}"${resume}></iframe></div>
<div class="row-actions"><button class="btn" type="button" id="fullscreen">Watch full screen</button>
<span class="small">Great for a computer plugged into the TV. Press Esc to exit.</span></div>`;
}

/** One download: Stream's HD MP4. (The uploaded original is only the source Stream copies from; it isn't offered.) On an
 * iPhone or iPad, public/video-save.js says where it goes, and in the Home Screen app opens it in Safari. */
function downloads(v: Video): SafeHtml {
	return html`<div class="panel dl"><div class="eyebrow">Download</div>
<a class="btn primary" href="/videos/${v.id}/download/hd" data-save-game="${v.id}">Download HD video <span>MP4</span></a><p class="small" data-save-game-hint hidden></p>
<ul class="small dl-notes"><li><b>HD video (MP4):</b> plays on any computer, phone or TV. Ready about 10 to 15 minutes after the game is ready to watch.</li>
<li>Or just watch it here in the browser: no download needed.</li></ul></div>`;
}

function heading(p: WatchPageProps): SafeHtml {
	if (!p.currentClip) return html`<div class="titleline"><h1>${gameTitle(p.game)}</h1>${starButton(`/games/${p.game.id}/favourite`, p.stars.game, p.result.back)}</div><p class="blurb">${p.blurb}</p>`;
	const clip = p.currentClip;
	const who = p.clips.find((c) => c.clip.id === clip.id)?.players ?? [];
	const tags = who.length ? html`<span class="who-in">${who.map((pl) => html`<span class="t src">${playerLabel(pl)}</span>`)}</span>` : "";
	return html`<div class="titleline"><div><div class="eyebrow">Highlight clip · ${gameTitle(p.game)}</div><h1>${clip.label}</h1>${tags}</div>
${starButton(`/clips/${clip.id}/favourite`, p.stars.clips.has(clip.id), p.result.back)}<a class="btn" href="/games/${p.game.id}">← Back to full game</a></div>`;
}

function removalForm(v: Video, team: Team): SafeHtml {
	return html`<details class="panel"><summary class="btn quiet">Ask for this video to be removed</summary>
<form method="post" action="/videos/${v.id}/removal-requests" class="stack">
<p class="small">${askWho(teamCopy(team))} will see your request. You don't have to give a reason.</p>
<label>Reason (optional)<input name="reason" type="text" maxlength="500" placeholder="My child shouldn't appear"></label>
<button class="btn primary">Send request</button></form></details>`;
}

function liveNote(p: WatchPageProps): SafeHtml | "" {
	if (!p.liveNote) return "";
	const again = films(p.frame.member.role) && p.frame.team.status === "active" ? html` <a href="/live?game=${p.game.id}">Go live again</a>` : "";
	return html`<div class="note warn" role="status">${p.liveNote}${again}</div>`;
}

export function watchPage(p: WatchPageProps): SafeHtml {
	const v = p.video;
	const ready = v?.status === "ready" ? v : null;
	const maker = ready && !p.currentClip && p.frame.team.status === "active" ? clipMaker(ready.id, p.players) : "";
	const scripts = ["/stream-sdk.js", "/watch.js", "/thumbs.js", ...(ready ? ["/video-save.js"] : []), ...(p.live && !p.live.ended ? ["/whep.js"] : [])];
	// Refreshes itself while the video is on its way or a stopped stream is saving, but never under the live player (a
	// reload cuts the picture and the sound; the recording counts as uploading): whep.js reloads it once it's over.
	const refreshSeconds = p.live ? liveRefreshSeconds(p.live) : isOnItsWay(v) ? 60 : undefined;
	return layout({ title: p.currentClip?.label ?? gameTitle(p.game), frame: p.frame, current: "games", scripts, refreshSeconds }, html`<div><a class="btn" href="/games">← All games</a></div>
${notice(p.message)}${liveNote(p)}<div class="watch${p.coachNotes ? " coaching" : ""}"><div class="stack watch-main">${player(p)}
${heading(p)}${maker}${ready ? removalForm(ready, p.frame.team) : ""}</div>
<aside class="side">${p.coachNotes}${ready ? clipsPanel(p.clips, p.game.id, p.currentClip?.id ?? null, p.frame.member, p.players, { starred: p.stars.clips, back: p.result.back }) : ""}${ready ? downloads(ready) : ""}
${gameDetails(p.game, p.result, p.frame.team)}${p.scoreForm}
${v && p.frame.member.role === "manager" ? managerActions(v, p.moveTargets) : ""}</aside></div>`);
}
