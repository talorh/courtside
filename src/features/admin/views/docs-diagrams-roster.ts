// The Documentation page's diagrams for running a team: how a roster week is filled, what changes the roster, and how
// the people and players a team manager enters are used.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { type Box, draw, figure } from "./docs-draw.ts";

type Step = Omit<Box, "x" | "y" | "w" | "h">;
const COL = [30, 270, 510];

export function rosterFillDiagram(): SafeHtml {
	const d = draw("rosterfill");
	const steps: Step[] = [
		{ title: "The fixture's weeks", sub: "Monday to Sunday, this season", kind: "store" },
		{ title: "Each game's slots", sub: "video, two scorers, lollies", kind: "step" },
		{ title: "Every-week families", sub: "their duty first, and no other", kind: "step" },
		{ title: "Fewest duties first", sub: "the families free that week", kind: "job" },
		{ title: "The cheapest share", sub: "each duty as even as it can be", kind: "job" },
		{ title: "Swaps to even out", sub: "totals within one of each other", kind: "done" },
	];
	// The second row runs right to left, so the steps snake down in order.
	const at = (i: number) => ({ x: i < 3 ? COL[i]! : COL[5 - i]!, y: i < 3 ? 30 : 130 });
	return figure("rosterfill", {
		w: 760, h: 230, min: 640, title: "How a roster week is filled",
		desc: "The roster takes the fixture's weeks, gives each game its slots, gives a duty one family does every week to that family, then shares the rest among the families free that week with the fewest duties, in the cheapest way for evenness, and afterwards swaps duties between families wherever that evens them out.",
		caption: "Weeks are filled in date order, a game at a time. Families on the roster now share the duties; duties set by hand are kept and counted.",
	}, html`${steps.map((s, i) => d.box({ ...s, ...at(i), w: 220, h: 56 }))}
${d.arrow([[250, 58], [268, 58]])}${d.arrow([[490, 58], [508, 58]])}${d.arrow([[620, 86], [620, 128]])}
${d.arrow([[510, 158], [492, 158]])}${d.arrow([[270, 158], [252, 158]])}
${d.label(30, 215, "More slots than families (a tournament weekend): a family takes a second game, never the same game twice.")}`);
}

export function rosterChangeDiagram(): SafeHtml {
	const d = draw("rosterchange");
	const rows: Array<[string, string, string, string]> = [
		["The Roster opened", "by anyone, once it's generated", "New games' weeks filled", "a week with no games left cleared"],
		["Generate roster", "the team manager", "Next week on shared out again", "this week and set-by-hand kept"],
		["Change on a week", "families picked by hand", "That week filled around them", "and kept by Generate roster"],
		["Duties saved", "on, off, or one family every week", "Next week on shared out again", "this week as families know it"],
		["A family off, then back", "away or injured", "Its weeks away count as done", "so it isn't caught up after"],
		["Scorers only this week", "a tournament weekend", "Two scorers a game, no extra", "and its games No video"],
	];
	const y = (i: number) => 16 + i * 66;
	return figure("rosterchange", {
		w: 700, h: y(rows.length) - 8, min: 600, title: "What changes the roster",
		desc: "Six things change the roster: opening it fills new games' weeks and clears ones with no games, Generate roster shares out next week on again, Change on a week fills that week around the families picked, saving the duties shares out next week on again, a family's time off counts as done, and Scorers only this week leaves a week with two scorers a game.",
		caption: "Past weeks keep what was done, and it still counts. A closed season's roster stays exactly as it was.",
	}, html`${rows.map(([what, sub, result, how], i) => html`${d.box({ x: 10, y: y(i), w: 300, h: 54, title: what, sub, kind: "person" })}
${d.arrow([[310, y(i) + 27], [368, y(i) + 27]])}${d.box({ x: 370, y: y(i), w: 320, h: 54, title: result, sub: how, kind: "done" })}`)}`);
}

export function peopleDiagram(): SafeHtml {
	const d = draw("people");
	const people: Step[] = [
		{ title: "Add a person", sub: "email, name and role", kind: "person" }, { title: "On the team's list", sub: "members, in D1", kind: "store" },
		{ title: "Asks for a code", sub: "only to a listed address", kind: "edge" }, { title: "Their role's pages", sub: "the list checked every time", kind: "worker" },
	];
	const players: Step[] = [
		{ title: "Players", sub: "name and number, up to 10", kind: "person" }, { title: "Home's squad", sub: "a singlet with their number", kind: "step" },
		{ title: "Clip tags", sub: "who's in each clip", kind: "step" }, { title: "Season's reels", sub: "each player's clips", kind: "done" },
	];
	const x = (i: number) => 10 + i * 190;
	return figure("people", {
		w: 760, h: 220, min: 640, title: "People and players",
		desc: "A team manager adds a person with their email, name and role; they're on the team's list, so they can ask for a sign-in code, and every request checks the list for what their role allows. Players, a name and number each, appear in Home's squad, tag highlight clips and gather each player's clips at the season's end.",
		caption: "Taking someone off the list works straight away: their next page checks it. Players are the squad only, never people who sign in.",
	}, html`${people.map((s, i) => d.box({ ...s, x: x(i), y: 30, w: 170 }))}${players.map((s, i) => d.box({ ...s, x: x(i), y: 140, w: 170 }))}
${[0, 1, 2].map((i) => d.arrow([[x(i) + 170, 58], [x(i + 1) - 2, 58]]))}
${d.arrow([[180, 168], [198, 168]])}${d.arrow([[95, 196], [95, 210], [475, 210], [475, 198]])}${d.arrow([[560, 168], [578, 168]])}`);
}
