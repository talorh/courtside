import { html, raw, type SafeHtml } from "../../../shared/html.ts";
import { LIVE_DOT } from "../../live/views/live-card.ts";

// The Full time card's court lines, as the Game break card draws them (public/golive-slate.js): the three-point
// line off to the left, the key and its free-throw circle top right.
const COURT = raw('<svg class="court" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="M76 -321A760 720 0 0 1 -69 776"/><path d="M1010 -10V290H1300"/><path d="M1290 290A140 140 0 0 1 1010 290"/><path class="dash" d="M1010 290A140 140 0 0 1 1290 290"/></svg>');

/**
 * The game page's live player. A stream from the Go live page plays over WebRTC (public/whep.js), about a second
 * behind. An external app's stream (RTMPS) can't: it plays in Stream's own player, the one saved videos use, about half
 * a minute behind.
 */
export interface LiveView {
	/** Signed WHEP address to play (Go live's camera), or the signed Stream player for the input (an external app). */
	source: { whep: string } | { player: string };
	isLive: boolean;
	/** End game was tapped: the phone is finishing its recording upload (or Stream its recording of the app). */
	ended: boolean;
}

/** How often the game's page reloads itself for this stream: once it's stopped (the video is on its way), or while an
 * external app's hasn't started (its player can't wait for one, as the WebRTC player does). Never while it plays. */
export const liveRefreshSeconds = (live: LiveView): number | undefined => (live.ended ? 60 : "player" in live.source && !live.isLive ? 30 : undefined);

function appPlayer(player: string, isLive: boolean): SafeHtml {
	if (!isLive) {
		return html`<div class="player"><img class="courtimg" src="/court.webp" alt=""></div>
<p class="small" role="status">The live stream hasn't started yet (or the camera has lost signal for a moment). This page checks by itself, and after the game it's saved here as the video.</p>`;
	}
	return html`<div class="player"><iframe data-live-player src="${player}" allow="autoplay; fullscreen; picture-in-picture" title="Live stream"></iframe></div>
<p class="live-status on" role="status">${LIVE_DOT}<b>Live now.</b> About half a minute behind the court.</p>
<div class="row-actions"><button class="btn" type="button" id="fullscreen">Watch full screen</button></div>`;
}

export function livePlayer(live: LiveView): SafeHtml {
	// Full time: the Game break card's look (bottle green, court lines, the club's logo), so the game ends as it paused.
	if (live.ended) {
		return html`<div class="player"><div class="live-over" role="status">${COURT}<span class="over-title">Full time</span><img src="/club-mark.webp" alt=""><b>The live stream has ended</b><span class="over-note">It's being saved and will be ready to watch here in about 20 to 25 minutes.</span></div></div>`;
	}
	if ("player" in live.source) return appPlayer(live.source.player, live.isLive);
	const note = live.isLive
		? html`<p class="live-status on" role="status">${LIVE_DOT}<b>Live now.</b> About a second behind the court.</p>`
		: html`<p class="small" role="status">The live stream hasn't started yet (or the filming phone has lost signal for a moment). It plays here by itself as soon as it's live, and after the game it's saved here as the video.</p>`;
	return html`<div class="player"><video data-live-player data-whep="${live.source.whep}" playsinline muted autoplay controls title="Live stream"></video>
<div class="live-wait" data-live-wait role="status" hidden><b>Live stream will resume shortly</b><span>The filming phone has lost its connection for a moment.</span><span>If it hasn't come back after 5 minutes, refresh this page.</span></div></div>${note}
<div class="row-actions"><button class="btn primary" type="button" data-unmute hidden>Turn the sound on</button></div>
<div class="row-actions"><button class="btn" type="button" id="fullscreen">Watch full screen</button></div>`;
}
