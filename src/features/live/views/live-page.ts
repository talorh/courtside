import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatShortDate } from "../../../shared/time.ts";
import { notice } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { Game } from "../../games/games-repository.ts";
import type { LiveInput } from "../../../platform/stream-live.ts";
import { type AppLive, appLiveCard } from "./app-live-card.ts";
import { webLiveCard } from "./web-live-card.ts";
import { teamCopy } from "../../teams/team-copy.ts";

interface LivePageProps {
	frame: PageFrame;
	games: Game[];
	selected: Game | null;
	/** The game's live input (opened when the page loads, so Go live is quick). None once End game was tapped, or
	 * while the game's recording is on its way (the page is only for saving it then). */
	input: LiveInput | null;
	/** Stream didn't answer when the page tried to set up the input. */
	unavailable: boolean;
	/** Why the last try at this game wasn't saved, if it wasn't. */
	lastTry: string | null;
	/** Streaming from this page: its recording upload, still going. */
	recordingVideoId: number | null;
	/** That recording is this filmer's (the page can offer to save it even if it wasn't made on this phone). */
	mine: boolean;
	/** End game was tapped: nothing can stream to this game again. */
	ended: boolean;
	/** The game is set to stream from an external app, not this page's camera: what its card shows. */
	app: AppLive | null;
	/** Today's games set to be recorded rather than live streamed (the Fixture): not offered, and the page says why. */
	recorded: Game[];
}

const recordedNote = (g: Game, Ask: string) => notice(`${g.startsAt.slice(11) >= "17:00" ? "Tonight's" : "Today's"} game vs ${g.opponent} is set to be recorded, not live streamed: film it with the phone's Camera app and upload it after the game. ${Ask} can change that on the Fixture.`, "warn");

function gamePicker(p: LivePageProps): SafeHtml {
	const options = p.games.map((g) => html`<option value="${g.id}"${g.id === p.selected?.id ? html` selected` : ""}>${formatShortDate(g.startsAt)} · vs ${g.opponent}</option>`);
	return html`<form method="get" action="/live" class="step done" id="game-form"><span class="n" aria-hidden="true">1</span><label for="game">Which game?
<select id="game" name="game">${options}</select>
<span class="small">Today's game is picked for you. Pick another if it's the wrong one.</span>
<button class="btn quiet" type="submit">Use this game</button></label></form>`;
}

/**
 * Under the camera's card and its big Start camera button: a smaller green button for the rare game filmed by an
 * external app (an AI tracking camera's own), which brings up the RTMPS details in the card's place. Only while the
 * game can still be switched: nothing has streamed, no recording is on its way. (Once the camera has started, the
 * page hides it: public/app.css.)
 */
function useAppButton(p: LivePageProps): SafeHtml | "" {
	if (p.input === null || p.recordingVideoId !== null) return "";
	return html`<form method="post" action="/live/${p.selected!.id}/app" class="useapp"><button class="btn primary">Use an external app instead</button>
<p class="small">Only for an AI tracking camera whose own app does the filming, like XbotGo's. <a href="/help#ai-cameras">Which cameras work</a></p></form>`;
}

function streamStep(p: LivePageProps): SafeHtml {
	if (p.app) return html`<div class="step"><span class="n live" aria-hidden="true">2</span><div class="stack">${appLiveCard(p.selected!.id, p.app)}</div></div>`;
	return html`<div class="step"><span class="n live" aria-hidden="true">2</span><div class="stack">${webLiveCard(p.selected!.id, p.recordingVideoId, p.ended, p.mine, teamCopy(p.frame.team).ask)}${useAppButton(p)}</div></div>`;
}

const UNAVAILABLE = "Go live can't start just now: the video service isn't answering. Wait a minute, then reload this page.";

export function livePage(p: LivePageProps): SafeHtml {
	const ready = p.input !== null || p.ended || p.recordingVideoId !== null || p.unavailable || p.app !== null;
	const body = !p.selected || !ready
		? notice(`There's no game to stream today or coming up. Ask ${teamCopy(p.frame.team).ask} to add the game to the Fixture first. Already played? Upload the video instead.`, "warn")
		: html`${p.unavailable ? notice(UNAVAILABLE, "warn") : ""}${p.lastTry ? notice(`${p.lastTry} You're all set to go live again: tap Start camera.`, "warn") : ""}
<div class="panel stack golive">${gamePicker(p)}${streamStep(p)}
${p.app ? html`<p class="small">More help: <a href="/help#ai-cameras">Filming with an AI tracking camera</a> in Help.</p>`
		: html`<p class="small">More help: <a href="/help#live-game">Live streaming a game</a> in Help.</p>`}</div>`;
	return layout({ title: "Go live", frame: p.frame, current: "live", scripts: ["/live.js", p.app ? "/golive-app.js" : "/golive.js"] }, html`<div class="uphero">
<div><div class="eyebrow">At the game? Stream it live</div><h1>Go live</h1></div>${p.recorded.map((g) => recordedNote(g, teamCopy(p.frame.team).Ask))}${body}</div>`);
}
