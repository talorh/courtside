import { describe, expect, it } from "vitest";
import { insertPlayer, listPlayers, updatePlayerRow } from "../../../src/features/players/players-repository.ts";
import { addPlayer, removePlayer, updatePlayer } from "../../../src/features/players/players-service.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

const B12 = "b12.1-2026";

/** B12.1 as the migrations leave it has its 10 players; most tests start from an empty squad. */
async function emptySquad() {
	const deps = createTestDeps();
	await deps.db.prepare("UPDATE players SET removed_at = '2026-10-01T00:00:00.000Z' WHERE team_id = ?").bind(B12).run();
	return deps;
}
const names = async (deps: ReturnType<typeof createTestDeps>) => (await listPlayers(deps.db, B12)).map((p) => `#${p.number} ${p.name}`);

describe("players, entered by the team manager", () => {
	it("a number taken a moment earlier by another team manager (past the check, at the insert) is refused, not an error", async () => {
		const deps = await emptySquad();
		await insertPlayer(deps.db, B12, { number: 7, name: "Chris" });
		await expect(insertPlayer(deps.db, B12, { number: 7, name: "Sam" })).rejects.toMatchObject({ status: 409, message: "#7 is already taken. Choose another number." });
		const sam = await insertPlayer(deps.db, B12, { number: 8, name: "Sam" });
		await expect(updatePlayerRow(deps.db, B12, sam, { number: 7, name: "Sam" })).rejects.toMatchObject({ status: 409, message: "#7 is already taken. Choose another number." });
		expect(await names(deps)).toEqual(["#7 Chris", "#8 Sam"]);
	});

	it("adds a player by number and name, trimmed", async () => {
		const deps = await emptySquad();
		await addPlayer(deps, { number: "5", name: "  Chris " });
		await addPlayer(deps, { number: "0", name: "Zoë-Jane O'Neil" });
		expect(await names(deps)).toEqual(["#0 Zoë-Jane O'Neil", "#5 Chris"]);
	});

	it("takes numbers 0 to 99 only", async () => {
		const deps = await emptySquad();
		for (const number of ["100", "-1", "5.5", "", "five", "07a"]) {
			await expect(addPlayer(deps, { number, name: "Sam" }), number).rejects.toMatchObject({ status: 400, message: "Numbers are 0 to 99." });
		}
	});

	it("gives a number to one current player at a time; a removed player's number is free again", async () => {
		const deps = await emptySquad();
		const chris = await addPlayer(deps, { number: "5", name: "Chris" });
		await expect(addPlayer(deps, { number: "5", name: "Jordan" })).rejects.toMatchObject({ status: 409, message: "#5 is already Chris's." });
		await removePlayer(deps, chris);
		await addPlayer(deps, { number: "5", name: "Jordan" });
		expect(await names(deps)).toEqual(["#5 Jordan"]);
	});

	it("takes a first name or a full name (the site is private): letters (any language), spaces, hyphens and apostrophes, up to 40", async () => {
		const deps = await emptySquad();
		for (const name of ["", "   ", "Sam Smith 2", "Sam!", "x".repeat(41), "<b>Sam</b>"]) {
			await expect(addPlayer(deps, { number: "7", name }), name).rejects.toMatchObject({ status: 400, message: "A player's name is letters only, up to 40." });
		}
		await addPlayer(deps, { number: "8", name: "  Giannis   Antetokounmpo-Smith " });
		expect((await listPlayers(deps.db, deps.team.id)).map((p) => p.name)).toContain("Giannis Antetokounmpo-Smith");
	});

	it("has at most 10 players a team (B12.1 has 10)", async () => {
		const deps = createTestDeps();
		expect(await listPlayers(deps.db, B12)).toHaveLength(10);
		await expect(addPlayer(deps, { number: "1", name: "Eleven" })).rejects.toMatchObject({ status: 409, message: "A squad can have up to 10 players. Remove one first." });
	});

	it("changes a player with the same rules; keeping your own number is fine", async () => {
		const deps = await emptySquad();
		const chris = await addPlayer(deps, { number: "5", name: "Chris" });
		await addPlayer(deps, { number: "19", name: "LeBron" });
		await updatePlayer(deps, chris, { number: "5", name: "Hank" });
		await expect(updatePlayer(deps, chris, { number: "19", name: "Hank" })).rejects.toMatchObject({ message: "#19 is already LeBron's." });
		await updatePlayer(deps, chris, { number: "6", name: "Hank" });
		expect(await names(deps)).toEqual(["#6 Hank", "#19 LeBron"]);
	});

	it("is this team's only: another team's player can't be changed or removed", async () => {
		const deps = await emptySquad();
		await deps.db.prepare("INSERT INTO teams (id, name, code, season_start) VALUES ('g14.5-2026', 'x', 'g14.5', 2026)").run();
		const theirs = (await deps.db.prepare("INSERT INTO players (team_id, number, name) VALUES ('g14.5-2026', 5, 'Gwen')").run()).meta.last_row_id;
		await expect(updatePlayer(deps, theirs, { number: "6", name: "X" })).rejects.toMatchObject({ status: 404 });
		await expect(removePlayer(deps, theirs)).rejects.toMatchObject({ status: 404 });
	});
});

describe("the Players section on Members", () => {
	it("lets a team manager add, change and remove players, each saying it's done", async () => {
		const deps = await emptySquad();
		const manager = makeClient(deps);
		const added = await manager("/players", form({ number: "7", name: "Sam" }));
		expect([added.status, added.headers.get("Location")]).toEqual([303, "/manage?done=player-added#players"]);
		const [sam] = await listPlayers(deps.db, B12);
		expect((await manager(`/players/${sam!.id}`, form({ number: "8", name: "Sammy" }))).headers.get("Location")).toBe("/manage?done=player-saved#players");
		expect((await manager(`/players/${sam!.id}/remove`, form({ confirm: "yes" }))).headers.get("Location")).toBe("/manage?done=player-removed#players");
		expect(await listPlayers(deps.db, B12)).toEqual([]);
		expect(await (await manager("/manage?done=player-added")).text()).toContain("Player added.");
	});

	it("shows the squad with how it's used, to team managers only", async () => {
		const deps = createTestDeps();
		const page = await (await makeClient(deps)("/manage")).text();
		expect(page).toContain('<section class="panel stack" id="players"');
		expect(page).toContain("The squad on Home and the players you can tag in highlight clips come from this list. A first name or a full name: only the team can see them.");
		expect(page).toContain('value="Chris"');
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'coach@x.com', 'coach')").bind(B12).run();
		expect((await makeClient(deps, "coach@x.com")("/players", form({ number: "7", name: "Sam" }))).status).toBe(403);
	});

	it("is what Home's squad and a clip's players come from; a removed player stays on clips already tagged", async () => {
		const deps = await emptySquad();
		const manager = makeClient(deps);
		await manager("/players", form({ number: "7", name: "Sam" }));
		expect(await (await manager("/")).text()).toContain("Sam");
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, streamUid: "u1" });
		const [sam] = await listPlayers(deps.db, B12);
		await manager(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20", label: "Steal", players: String(sam!.id) }));
		await manager(`/players/${sam!.id}/remove`, form({ confirm: "yes" }));
		const game = await (await manager(`/games/${gameId}`)).text();
		expect(game).toContain("#7 Sam");
		expect(await (await manager("/")).text()).not.toContain(">Sam<");
	});
});
