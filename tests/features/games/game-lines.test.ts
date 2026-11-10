import { describe, expect, it } from "vitest";
import { gameBlurb } from "../../../src/features/games/game-blurb.ts";
import { CLUB_LINES } from "../../../src/features/games/game-lines-club.ts";
import { checkLines, LINE_KINDS, renderLine } from "../../../src/features/games/game-lines.ts";
import type { Score } from "../../../src/features/scores/scores-repository.ts";

const game = (id: number, opponent = "Lakeside Rockets", venue = "Lakeside Stadium, Court 2") => ({ id, opponent, venue });
const score = (ours: number, opponent: number): Score => ({ gameId: 1, ours, opponent, source: "manual" });
const problems = (kind: Parameters<typeof checkLines>[0], text: string) => {
	const r = checkLines(kind, text);
	return "problems" in r ? r.problems : [];
};

describe("a team's game lines", () => {
	it("fills in the opponent, the venue and the score, and leaves out at {venue} when there's no venue", () => {
		const slots = { who: "Lakeside Rockets", venue: "Lakeside Stadium", h: 34, o: 28 };
		expect(renderLine("Swish! The Saints beat {opponent} at {venue}. It was {ours} to {them}.", slots))
			.toBe("Swish! The Saints beat Lakeside Rockets at Lakeside Stadium. It was 34 to 28.");
		expect(renderLine("The Saints take on {opponent} at {venue} tonight.", { ...slots, venue: "" })).toBe("The Saints take on Lakeside Rockets tonight.");
	});

	it("uses the team's own lines for a group it has changed, and the club's for the rest", () => {
		const won = ["Swish! The Saints beat {opponent} at {venue}. It was {ours} to {them}."];
		expect(gameBlurb(game(1), "complete", score(34, 28), { won })).toBe("Swish! The Saints beat Lakeside Rockets at Lakeside Stadium, Court 2. It was 34 to 28.");
		expect(gameBlurb(game(1), "complete", score(28, 34), { won })).toBe(gameBlurb(game(1), "complete", score(28, 34)));
		const away = ["Road trip! The Saints take on {opponent} at {venue}."];
		const upcoming = Array.from({ length: 6 }, (_, i) => gameBlurb(game(i + 1), "upcoming", null, { away, upcoming: ["The Saints play {opponent} at {venue}."] }));
		expect(new Set(upcoming)).toEqual(new Set(["The Saints play Lakeside Rockets at Lakeside Stadium, Court 2.", "Road trip! The Saints take on Lakeside Rockets at Lakeside Stadium, Court 2."]));
		expect(gameBlurb(game(1, "Bayside 6"), "complete", null, { rivals_played: ["Derby day done: the Saints met {opponent} at {venue}."] }))
			.toBe("Derby day done: the Saints met Bayside 6 at Lakeside Stadium, Court 2.");
	});

	it("passes every one of the club's lines", () => {
		for (const kind of LINE_KINDS) expect(checkLines(kind, CLUB_LINES[kind].join("\n")), kind).toEqual({ lines: CLUB_LINES[kind] });
	});

	it("keeps a box's lines trimmed, one a row, and an empty box means the club's lines", () => {
		expect(checkLines("won", "  The Saints beat {opponent} at {venue}. It was {ours} to {them}.  \r\n\n")).toEqual({ lines: ["The Saints beat {opponent} at {venue}. It was {ours} to {them}."] });
		expect(checkLines("won", " \n ")).toEqual({ lines: [] });
	});

	it("says which line is wrong and why", () => {
		expect(problems("upcoming", "The Saints play at {venue}.")).toEqual(["Line 1 needs {opponent}, the team the Saints play."]);
		expect(problems("won", "The Saints beat {opponent} {ours} to nil.")).toEqual(["Line 1 needs both scores, {ours} and {them}."]);
		expect(problems("drew", "The Saints and {opponent} drew.")).toEqual(["Line 1 needs the score, {ours}."]);
		expect(problems("upcoming", "The Saints beat {opponent} {ours} to {them}.")).toEqual(["Line 1 shows the score, which only the Won, Won by one point, Lost and Drew lines can."]);
		expect(problems("played", "The Saints met {opponent}.\nThe Saints met {opponent} and {player} starred.")).toEqual(["Line 2 has {player}, which isn't one of {opponent}, {venue}, {ours} and {them}."]);
		expect(problems("played", "{venue} was where the Saints met {opponent}.")).toEqual(["Line 1 should start with a capital letter.", "Line 1 has {venue} without \"at\" just before it: write \"at {venue}\", so it can be left out when a game has no venue."]);
		expect(problems("won", "The Saints beat {opponent} at {venue} {ours} to {them}.")).toEqual(["Line 1 has a score straight after the venue, where it would run into a court number: put words between them."]);
		expect(problems("played", "The Saints met {opponent}")).toEqual(["Line 1 should end with a full stop, ! or ?."]);
		expect(problems("played", `The Saints met {opponent}${" and".repeat(50)}.`)).toEqual(["Line 1 is longer than 200 letters."]);
		expect(problems("played", Array.from({ length: 21 }, () => "The Saints met {opponent}.").join("\n"))).toEqual(["There are 21 lines: 20 at most."]);
	});
});
