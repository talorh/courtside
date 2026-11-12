import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate } from "../../../shared/time.ts";
import { notice, pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { Member } from "../../members/members-repository.ts";
import { gamePhase, gameTitle } from "../game-format.ts";
import type { Game, GameWithVideo } from "../games-repository.ts";
import type { PlayhqFixture } from "../playhq-repository.ts";
import type { Score } from "../../scores/scores-repository.ts";
import { scoreTag } from "../../scores/views/score-line.ts";
import { gameFields } from "./game-fields.ts";
import { competitionTags } from "./phase-tag.ts";
import { addFixtureForm, addSheetForm, playhqPanel } from "./playhq-panel.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import { fixtureTeamName } from "../../teams/team-code.ts";
import { teamCopy } from "../../teams/team-copy.ts";

export const FIXTURE_MESSAGES: Record<string, string> = {
	added: "Game added.", saved: "Game saved.", deleted: "Game deleted.", deletedall: "Game and its footage deleted. The files are kept for 24 hours in case it was a mistake.",
	novideo: "Saved as No video. It won't be offered for upload or Go live, and nobody's rostered to film it.",
	playhqadded: "PlayHQ fixture added and its games brought in.", playhqchecked: "Checked PlayHQ. The games are up to date.",
	playhqfailed: "Couldn't read PlayHQ just now. The games are as they were; try Check now again later.",
	playhqremoved: "PlayHQ fixture removed. Its games stay, and they're no longer checked.",
	playhqnovideo: "No video for that fixture: its games (and any it adds later) are marked No video.",
	playhqvideo: "Video allowed for that fixture: its games can be uploaded or streamed again.",
	imported: "Games added.", importnone: "No games added: none were ticked, or they're already in the fixture.",
};

interface FixturePageProps {
	frame: PageFrame;
	/** Team managers: add, edit (No video too), delete and PlayHQ. Everyone else (coaches too) just sees the games. */
	canEdit: boolean;
	games: GameWithVideo[];
	playhq: PlayhqFixture[];
	editing: Game | null;
	/** What a change just did (`?done=`), or null. */
	message: string | null;
	nowLocal: string;
	/** A new game's date and tip-off: the coming Friday, at the team's usual time. */
	defaultStart: { date: string; time: string };
	/** Games being live streamed: "saving" once End game was tapped, else "streaming". */
	live: Map<number, "streaming" | "saving">;
	/** Final scores, by game (not shown to a member who hides scores). */
	scores: Map<number, Score>;
}

/** Live stream or Recorded, for a game still to come or being played (one with a video, or No video, doesn't need it). */
const planTag = (game: Game, nowLocal: string): SafeHtml | "" => !game.noVideo && gamePhase(game.startsAt, nowLocal) !== "complete"
	? html` <span class="t src">${game.liveStream ? "Live stream" : "Recorded"}</span>` : "";

function status({ game, videoStatus }: GameWithVideo, nowLocal: string, live: "streaming" | "saving" | undefined, scored: boolean): SafeHtml {
	if (videoStatus === "ready") return html`<span class="role c">Has video</span>`;
	// A live stream's recording is an upload too, so the stream comes first.
	if (live === "saving") return html`<span class="role">Saving live stream</span>`;
	if (live === "streaming") return html`<span class="role">Live stream</span>`;
	if (videoStatus === "failed") return html`<span class="role f">Upload failed</span>`;
	if (videoStatus === "uploading") return html`<span class="role">Uploading</span>`;
	if (videoStatus === "processing") return html`<span class="role">Processing</span>`;
	if (game.noVideo) return html`<span class="role">No video</span>`;
	const phase = gamePhase(game.startsAt, nowLocal, scored);
	if (phase === "upcoming") return html`<span class="role">Upcoming</span>${planTag(game, nowLocal)}`;
	return phase === "in_progress" ? html`<span class="role">In progress</span>${planTag(game, nowLocal)}` : html`<span class="role f">Waiting for video</span>`;
}

/** Deleting asks first: a game alone comes off the Fixture; a game with its video takes the video and clips with it. */
function deleteAction(row: GameWithVideo, member: Member): SafeHtml | "" {
	const question = `Delete ${gameTitle(row.game)} (${formatGameDate(row.game.startsAt)})?`;
	if (row.videoStatus === null) return confirmButton({ action: `/fixture/${row.game.id}/delete`, label: "Delete", question, consequence: "It comes off the Fixture." });
	return member.role === "manager" ? confirmButton({
		action: `/fixture/${row.game.id}/delete-all`, label: "Delete game and video", question,
		consequence: "The game, its video and its clips are deleted. The files are kept for 24 hours in case it was a mistake, then they're gone for good.",
	}) : "";
}

export function fixturePage(p: FixturePageProps): SafeHtml {
	return p.canEdit ? editorPage(p) : viewPage(p);
}

/** The games, for everyone: when, who against, where, and whether it's still to come, being played or over. */
function viewPage(p: FixturePageProps): SafeHtml {
	const PHASE = { upcoming: html`<span class="role">Upcoming</span>`, in_progress: html`<span class="role">In progress</span>`, complete: html`<span class="role c">Complete</span>` };
	const played = (g: Game) => PHASE[gamePhase(g.startsAt, p.nowLocal, p.scores.has(g.id))];
	const rows = p.games.map(({ game }) => html`<tr><td class="f-date">${formatGameDate(game.startsAt)}</td><td class="f-game"><a href="/games/${game.id}">${gameTitle(game)}</a> ${scoreTag(p.scores.get(game.id), p.frame.member.hideScores)}</td>
<td class="f-type">${competitionTags(game)}</td><td class="f-venue">${game.venue}</td><td class="f-status">${played(game)}${planTag(game, p.nowLocal)}</td></tr>`);
	return layout({ title: "Fixture", frame: p.frame, current: "fixture" }, html`${pageHead("This season", "Fixture")}
<p class="small">Every game, with tip-off times and venues. ${teamCopy(p.frame.team).Ask} keeps it up to date.</p>
<div class="tablewrap cards"><table class="fixture"><thead><tr><th>Date</th><th>Game</th><th>Type</th><th>Venue</th><th>Status</th></tr></thead>
<tbody>${rows.length ? rows : html`<tr><td colspan="5">No games yet. Preseason, clearly.</td></tr>`}</tbody></table></div>`);
}

function editorPage(p: FixturePageProps): SafeHtml {
	const form = p.editing
		? html`<form class="panel stack" method="post" action="/fixture/${p.editing.id}"><h2>Edit game</h2>
${p.editing.fromPlayhq ? html`<p class="small">This game comes from PlayHQ, and each check copies PlayHQ's details over any change made here.</p>` : ""}${gameFields(p.editing, p.defaultStart)}
<div class="row-actions"><button class="btn primary">Save game</button><a class="btn" href="/fixture">Cancel</a></div></form>`
		: html`<div class="addbar"><details class="panel"><summary class="btn primary">Add game</summary><form method="post" action="/fixture" class="stack addgame">${gameFields({}, p.defaultStart)}
<div class="row-actions"><button class="btn primary">Save game</button></div></form></details>${addFixtureForm(fixtureTeamName(p.frame.team.code))}${addSheetForm()}</div>`;
	const rows = p.games.map((row) => html`<tr><td class="f-date">${formatGameDate(row.game.startsAt)}</td><td class="f-game"><a href="/games/${row.game.id}">${gameTitle(row.game)}</a> ${scoreTag(p.scores.get(row.game.id), p.frame.member.hideScores)}</td>
<td class="f-type">${competitionTags(row.game)}</td><td class="f-venue">${row.game.venue}${row.game.playhqGone ? html`<span class="gone">Not on PlayHQ any more</span>` : ""}</td><td class="f-status">${status(row, p.nowLocal, p.live.get(row.game.id), p.scores.has(row.game.id))}</td>
<td class="f-acts row-actions"><a class="btn quiet" href="/fixture?edit=${row.game.id}">Edit</a>${deleteAction(row, p.frame.member)}</td></tr>`);
	return layout({ title: "Fixture", frame: p.frame, current: "fixture" }, html`${pageHead(null, "Fixture")}
${notice(p.message)}
<p class="small">Whoever films picks from this list. Add fixture brings in a team's games from a link (PlayHQ, or any public fixture page), Add from a spreadsheet from a CSV, and Add game is for one game, like a practice match. A game that won't be filmed (or wasn't, or whose video was lost): Edit it and set Video to No video.</p>
${form}${playhqPanel(p.playhq, p.nowLocal.slice(0, 10))}
<div class="tablewrap cards"><table class="fixture"><thead><tr><th>Date</th><th>Game</th><th>Type</th><th>Venue</th><th>Video</th><th></th></tr></thead>
<tbody>${rows.length ? rows : html`<tr><td colspan="6">No games yet. Preseason, clearly.</td></tr>`}</tbody></table></div>`);
}
