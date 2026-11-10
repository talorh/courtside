import { describe, expect, it } from "vitest";
import { CLUB_LINES } from "../../../src/features/games/game-lines-club.ts";
import { LINE_KINDS } from "../../../src/features/games/game-lines.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";
import { addTeam, G14_5 } from "../../helpers/two-teams.ts";

const WON = "Swish! The Saints beat {opponent} at {venue}. It was {ours} to {them}.";
// Every box as the page sends it: the club's lines, with `changes` in place of some.
const boxes = (changes: Record<string, string> = {}) => form(Object.fromEntries(LINE_KINDS.map((k) => [k, changes[k] ?? CLUB_LINES[k].join("\n")])));
const logLines = async (deps: TestDeps) => (await deps.db.prepare("SELECT team_id, action, detail FROM admin_log WHERE action = 'game_lines_changed'").all()).results;
const blurbOf = async (client: ReturnType<typeof makeClient>, gameId: number) =>
	(await (await client(`/games/${gameId}`)).text()).split('<p class="blurb">')[1]?.split("</p>")[0] ?? "";

describe("Game lines, on Manage team", () => {
	it("shows the team manager every group with the club's lines, linked from Manage team", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		expect(await (await manager("/manage")).text()).toContain('href="/manage/game-lines"');
		const page = await (await manager("/manage/game-lines")).text();
		for (const kind of LINE_KINDS) expect(page).toContain(`name="${kind}"`);
		expect(page).toContain("Nothing but net: the Saints beat {opponent} at {venue}. Final score {ours} to {them}.");
		expect(page).toContain("<li>Nothing but net: the Saints beat Lakeside Rockets at Lakeside Stadium, Court 2. Final score 34 to 28.</li>");
	});

	it("saves a changed group, uses it on the game page and logs which groups changed", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Lakeside Rockets", venue: "Lakeside Stadium" });
		const manager = makeClient(deps);
		await manager(`/games/${gameId}/score`, form({ ours: "34", opponent: "28" }));
		const res = await manager("/manage/game-lines", boxes({ won: WON, drew: "Honours even with {opponent} at {venue}. It finished {ours} all." }));
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe("/manage/game-lines?done=saved");
		expect(await blurbOf(manager, gameId)).toBe("Swish! The Saints beat Lakeside Rockets at Lakeside Stadium. It was 34 to 28.");
		expect(await logLines(deps)).toEqual([{ team_id: deps.team.id, action: "game_lines_changed", detail: "Won, Drew" }]);
		const page = await (await manager("/manage/game-lines?done=saved")).text();
		expect(page).toContain("Game lines saved.");
		expect(page).toContain(WON);
	});

	it("keeps the text and saves nothing when a line is wrong", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		const res = await manager("/manage/game-lines", boxes({ won: `${WON}\nThe Saints won.`, lost: "The Saints lost to {opponent}." }));
		expect(res.status).toBe(400);
		const page = await res.text();
		expect(page).toContain("Won: Line 2 needs {opponent}");
		expect(page).toContain("Lost: Line 1 needs both scores");
		expect(page).toContain("The Saints won.</textarea>");
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM game_lines").first("n")).toBe(0);
		expect(await logLines(deps)).toEqual([]);
	});

	it("goes back to the club's lines for an emptied box, and saves and logs nothing when nothing changed", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		await manager("/manage/game-lines", boxes({ won: WON }));
		await manager("/manage/game-lines", boxes({ won: WON }));
		expect(await logLines(deps)).toHaveLength(1);
		await manager("/manage/game-lines", boxes({ won: "" }));
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM game_lines").first("n")).toBe(0);
		expect((await logLines(deps)).map((l) => (l as { detail: string }).detail)).toEqual(["Won", "Won"]);
		expect(await (await manager("/manage/game-lines")).text()).toContain(CLUB_LINES.won[0]!);
	});

	it("is only for team managers, and each team keeps its own", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'coach@x.com', 'coach')").bind(deps.team.id).run();
		const coach = makeClient(deps, "coach@x.com");
		expect((await coach("/manage/game-lines")).status).toBe(403);
		expect((await coach("/manage/game-lines", boxes({ won: WON }))).status).toBe(403);
		await addTeam(deps.db);
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'jane@x.com', 'manager')").bind(G14_5.id).run();
		await makeClient(deps, { email: "jane@x.com", team: G14_5.id })("/manage/game-lines", boxes({ won: WON }));
		expect((await deps.db.prepare("SELECT team_id FROM game_lines").all()).results).toEqual([{ team_id: G14_5.id }]);
		expect(await (await makeClient(deps)("/manage/game-lines")).text()).not.toContain(WON);
	});
});
