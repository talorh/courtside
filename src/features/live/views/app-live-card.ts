import { html, type SafeHtml } from "../../../shared/html.ts";
import { notice } from "../../../ui/components.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import type { AppStatus } from "../app-live-service.ts";
import { LIVE_DOT } from "./live-card.ts";

/** A game set to an external app, for Go live's second step: its address to copy (none when Stream didn't answer) and
 * whether its stream is arriving. */
export interface AppLive {
	address: { url: string; streamKey: string } | null;
	status: AppStatus;
}

/** The status line: all three things it can say, one showing. public/golive-app.js shows the one that's true now. */
function appStatusLine(s: AppStatus): SafeHtml {
	const now = s.live ? "live" : s.streamed ? "quiet" : "waiting";
	const says = (when: string, text: SafeHtml | string) => html`<span data-says="${when}"${when === now ? "" : html` hidden`}>${text}</span>`;
	return html`<p class="live-status appsays${s.live ? " on" : ""}" data-app-status role="status">
${says("live", html`${LIVE_DOT} <b>Live.</b> The site is receiving the external app's stream, and families can watch.`)}
${says("quiet", "Nothing is arriving from the external app just now. If the game's still going, check the app.")}
${says("waiting", "Waiting for the external app. Start the stream in the app and this says when it arrives.")}</p>`;
}

const copyRow = (id: string, label: string, value: string): SafeHtml => html`<div class="copyrow"><label for="${id}">${label}</label>
<input id="${id}" value="${value}" readonly autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" type="button" data-copy="${id}">Copy</button></div>`;

/**
 * Go live's second step for a game set to an external app (RTMPS) in place of this page's camera: the server and stream
 * key to copy into the app, whether the site is receiving its stream (public/golive-app.js keeps that up to date),
 * and End game.
 */
export function appLiveCard(gameId: number, { address, status }: AppLive): SafeHtml {
	const copy = address
		? html`${copyRow("app-server", "Server", address.url)}${copyRow("app-key", "Stream key", address.streamKey)}
<details class="small"><summary>The app has one box for the address?</summary>${copyRow("app-address", "Whole address", `${address.url}${address.streamKey}`)}</details>`
		: notice("The video service isn't answering, so the server and stream key can't be shown just now. Wait a minute, then reload this page.", "warn");
	return html`<section class="appcard appstream" aria-labelledby="app-title" data-app-game="${gameId}">
<h3 id="app-title">Stream from an external app</h3>${appStatusLine(status)}
<p class="small"><b>RTMPS</b> is the standard way a camera app sends a live stream to a website. The app needs two things from here: a server address and a stream key.</p>
<ol class="steps"><li>In the camera's app, open its live streaming settings and choose <b>Custom RTMP</b> (or RTMPS). Copy these in.
<b>The stream key is this game's password: don't share it.</b>${copy}</li>
<li>Start the stream in the app during the warm-up. This page says when the site is receiving it.</li>
<li>Only after the final buzzer, stop the stream in the app, then tap <b>End game</b> here: once ended, it can't start again.</li></ol>
<div class="appacts">${confirmButton({ action: `/live/${gameId}/app-stop`, label: "End game", question: "End the game?", consequence: "Only at the final buzzer: the stream can't be started again.", yes: "Yes, end game", keep: "Keep streaming", summaryClass: "btn danger" })}
${status.streamed ? "" : html`<form method="post" action="/live/${gameId}/camera" data-app-back><button class="btn">Use this phone's camera instead</button></form>`}</div>
<p class="small">Forgot to tap it? The game saves itself 20 minutes after the app stops. Families watch about half a minute behind the court.
The saved video is what reaches the site, so a weak signal shows in it: if the app records the game too, keep that recording.</p></section>`;
}
