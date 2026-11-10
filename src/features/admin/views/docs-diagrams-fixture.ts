// The Documentation page's fixture diagrams: the ways games come in, a fixture page read by AI, PlayHQ's checks, and
// the final scores.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { draw, figure } from "./docs-draw.ts";

export function fixtureInDiagram(): SafeHtml {
	const d = draw("fixturein");
	return figure("fixturein", {
		w: 760, h: 300, min: 640, title: "How games come into the fixture",
		desc: "A PlayHQ team link is read from PlayHQ's feed and its games saved straight away, then checked again by themselves; any other public fixture page is read by Workers AI, and a spreadsheet is read in the Worker; those two are shown to check first, and only the ticked games are added.",
		caption: "A game can always be added, changed or deleted by hand too. PlayHQ's games need no check page: they're PlayHQ's own, and later checks keep them in step.",
	}, html`${d.box({ x: 10, y: 20, w: 210, title: "A PlayHQ team link", sub: "VJBL or a tournament", kind: "person" })}
${d.box({ x: 275, y: 20, w: 210, title: "Any fixture page", sub: "a club site, a draw, a tournament", kind: "person" })}
${d.box({ x: 540, y: 20, w: 210, title: "A spreadsheet", sub: "a CSV, Australian dates", kind: "person" })}
${d.box({ x: 10, y: 120, w: 210, title: "PlayHQ's feed", sub: "api.playhq.com/graphql", kind: "service" })}
${d.box({ x: 275, y: 120, w: 210, title: "Workers AI", sub: "reads the page's text", kind: "service" })}
${d.box({ x: 540, y: 120, w: 210, title: "Read in the Worker", sub: "columns found by their names", kind: "worker" })}
${d.box({ x: 10, y: 220, w: 210, title: "Saved at once", sub: "then checked by itself", kind: "done" })}
${d.box({ x: 275, y: 220, w: 300, title: "Shown to check first", sub: "problems listed, repeats left out", kind: "step" })}
${d.box({ x: 600, y: 220, w: 150, title: "Ticked ones in", sub: "in one batch", kind: "done" })}
${d.arrow([[115, 76], [115, 118]])}${d.arrow([[380, 76], [380, 118]])}${d.arrow([[645, 76], [645, 118]])}
${d.arrow([[115, 176], [115, 218]])}${d.arrow([[380, 176], [380, 218]])}${d.arrow([[645, 176], [645, 198], [520, 198], [520, 218]])}
${d.arrow([[575, 248], [598, 248]])}`);
}

export function aiReadDiagram(): SafeHtml {
	const d = draw("airead");
	const [manager, worker, page, ai] = [80, 280, 480, 670];
	return figure("airead", {
		w: 760, h: 350, min: 640, title: "Reading a fixture page with AI",
		desc: "The team manager pastes a fixture page's link; the Worker fetches the page securely, cuts it down to its text, and sends that with the team's names to Workers AI, which answers with the team's games as JSON; the Worker checks every game and shows them to check.",
		caption: "Nothing is added until the team manager ticks the games. A page that draws its fixture with JavaScript after it loads has no games in its text, and the site says so.",
	}, html`${d.lane(manager, 140, "Team manager", 340, "person")}${d.lane(worker, 140, "Worker", 340, "worker")}${d.lane(page, 140, "The page", 340, "edge")}${d.lane(ai, 140, "Workers AI", 340, "service")}
${d.message(manager, worker, 100, "the page's link")}
${d.message(worker, page, 144, "fetched over https")}
${d.message(page, worker, 188, "up to 2 MB of HTML")}
${d.message(worker, ai, 232, "its text, and the team's names")}
${d.message(ai, worker, 276, "the team's games, as JSON")}
${d.message(worker, manager, 320, "the games to check")}`);
}

export function playhqSyncDiagram(): SafeHtml {
	const d = draw("playhqsync");
	return figure("playhqsync", {
		w: 760, h: 300, min: 640, title: "Keeping a PlayHQ fixture in step",
		desc: "The 5-minute job finds each PlayHQ fixture due a check, reads the team's fixture from PlayHQ's feed and matches each game to one already here; new games are added, changed ones updated, and ones PlayHQ dropped are marked, never deleted. Checks stop by themselves, and a failed read changes nothing.",
		caption: "A game deleted here stays deleted on later checks. A failed read is saved on the fixture, and team managers see it on every page until a check works.",
	}, html`${d.box({ x: 10, y: 16, w: 230, title: "Due for a check?", sub: "8 hours; a tournament hourly", kind: "job" })}
${d.box({ x: 265, y: 16, w: 230, title: "Read PlayHQ's feed", sub: "the team's fixture, every game", kind: "service" })}
${d.box({ x: 520, y: 16, w: 230, title: "Match each game", sub: "by PlayHQ's id, or one added by hand", kind: "step" })}
${d.box({ x: 10, y: 128, w: 230, title: "New: added", sub: "usual tip-off until PlayHQ sets one", kind: "done" })}
${d.box({ x: 265, y: 128, w: 230, title: "Changed: updated", sub: "time, venue, opponent, round", kind: "done" })}
${d.box({ x: 520, y: 128, w: 230, title: "Dropped: marked", sub: "Not on PlayHQ any more", kind: "service" })}
${d.box({ x: 10, y: 228, w: 360, title: "Checks stop by themselves", sub: "VJBL six weeks after its last game", kind: "step" })}
${d.box({ x: 390, y: 228, w: 360, title: "A failed read changes nothing", sub: "saved on the fixture, shown to team managers", kind: "stop" })}
${d.arrow([[240, 44], [263, 44]])}${d.arrow([[495, 44], [518, 44]])}
${d.arrow([[635, 72], [635, 100], [125, 100], [125, 126]])}${d.arrow([[380, 100], [380, 126]])}${d.arrow([[635, 100], [635, 126]])}`);
}

export function scoresDiagram(): SafeHtml {
	const d = draw("scores");
	const steps: Array<[string, string, "step" | "job" | "stop"]> = [
		["Tip-off", "In progress", "step"], ["An hour on", "the game's over", "step"], ["Every run", "for the next 2 hours", "job"],
		["About hourly", "until 3 days after", "job"], ["Stops", "never asked again", "stop"],
	];
	return figure("scores", {
		w: 760, h: 250, min: 640, title: "A PlayHQ game's final score",
		desc: "During the game's hour it says In progress; once it's over the 5-minute job asks PlayHQ every run for two hours, then about hourly until three days after tip-off, then stops; a FINAL result with both scores is entered, never over a score a team manager typed.",
		caption: "Results usually go into PlayHQ at the final buzzer, so most scores arrive within minutes. A team manager can enter or fix any score once the game has started.",
	}, html`${steps.map(([title, sub, kind], i) => d.box({ x: 10 + i * 150, y: 40, w: 140, title, sub, kind }))}
${[0, 1, 2, 3].map((i) => d.arrow([[150 + i * 150, 68], [158 + i * 150, 68]]))}
${d.box({ x: 160, y: 140, w: 440, title: "FINAL with both scores: entered", sub: "never over a score a team manager typed", kind: "done" })}
${d.arrow([[380, 96], [380, 138]])}${d.arrow([[530, 96], [530, 138]])}
${d.label(10, 230, "Only games from a PlayHQ fixture are asked about, at most four a run.")}`);
}
