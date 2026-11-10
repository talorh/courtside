import { describe, expect, it } from "vitest";
import { listPlayers, playersByClip } from "../../../src/features/players/players-repository.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

/** A form that can send a field several times, like ticked checkboxes. */
const formOf = (fields: Array<[string, string]>): RequestInit => ({ method: "POST", body: new URLSearchParams(fields) });

async function setup() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Pat', 'watcher')").bind(deps.team.id).run();
	const gameId = await seedGame(deps);
	const videoId = await seedVideo(deps, { gameId, streamUid: "u1", r2Key: "originals/a.mov" });
	const players = await listPlayers(deps.db, deps.team.id);
	const id = (name: string) => String(players.find((p) => p.name === name)!.id);
	return { deps, gameId, videoId, id, admin: makeClient(deps), watcher: makeClient(deps, "p@x.com") };
}

describe("who's in a highlight clip", () => {
	it("the team's players, in number order, as #5 Robinson", async () => {
		const deps = createTestDeps();
		expect((await listPlayers(deps.db, deps.team.id)).map((p) => `#${p.number} ${p.name}`)).toEqual([
			"#5 Robinson", "#6 Ewing", "#7 Bird", "#8 Pippen", "#9 Jordan", "#10 Drexler", "#11 Malone", "#12 Stockton", "#14 Barkley", "#15 Magic",
		]);
	});
	it("ticked when making the clip, and shown on it in number order", async () => {
		const { deps, gameId, videoId, id, watcher } = await setup();
		const page = await (await watcher(`/games/${gameId}`)).text();
		expect(page).toContain("Who's in it?");
		expect(page.indexOf("#5 Robinson")).toBeLessThan(page.indexOf("#15 Magic"));
		const res = await watcher(`/videos/${videoId}/clips`, formOf([["start", "0:10"], ["end", "0:20"], ["label", "Steal and score"], ["players", id("Jordan")], ["players", id("Robinson")]]));
		expect(res.status).toBe(303);
		expect([...(await playersByClip(deps.db, deps.team.id, [1])).get(1)!].map((p) => p.name)).toEqual(["Robinson", "Jordan"]);
		expect(await (await watcher(`/games/${gameId}`)).text()).toContain('<span class="who-in"><span class="t src">#5 Robinson</span><span class="t src">#9 Jordan</span></span>');
		await deps.db.prepare("UPDATE clips SET status = 'ready'").run();
		expect(await (await watcher(`/games/${gameId}?clip=1`)).text()).toContain('<h1>Steal and score</h1><span class="who-in"><span class="t src">#5 Robinson</span>');
	});
	it("no players ticked is fine", async () => {
		const { deps, videoId, watcher } = await setup();
		expect((await watcher(`/videos/${videoId}/clips`, formOf([["start", "0:10"], ["end", "0:20"]]))).status).toBe(303);
		expect((await playersByClip(deps.db, deps.team.id, [1])).size).toBe(0);
	});
	it("the same player sent twice (a crafted post) counts once, never an error", async () => {
		const { deps, videoId, id, watcher } = await setup();
		expect((await watcher(`/videos/${videoId}/clips`, formOf([["start", "0:10"], ["end", "0:20"], ["players", id("Jordan")], ["players", id("Jordan")]]))).status).toBe(303);
		expect([...(await playersByClip(deps.db, deps.team.id, [1])).get(1)!].map((p) => p.name)).toEqual(["Jordan"]);
	});
	it("a player who isn't on the list is refused before Stream cuts anything", async () => {
		const { deps, videoId, watcher } = await setup();
		expect((await watcher(`/videos/${videoId}/clips`, formOf([["start", "0:10"], ["end", "0:20"], ["players", "999"]]))).status).toBe(400);
		expect(deps.clipper.requests).toEqual([]);
	});
	it("the maker or a team manager can change who's in it; others can't", async () => {
		const { deps, gameId, videoId, id, admin, watcher } = await setup();
		await admin(`/videos/${videoId}/clips`, formOf([["start", "0:10"], ["end", "0:20"], ["players", id("Barkley")]]));
		expect((await watcher("/clips/1/players", formOf([["players", id("Malone")]]))).status).toBe(403);
		expect((await admin("/clips/1/players", formOf([["players", id("Malone")], ["players", id("Ewing")]]))).headers.get("Location")).toBe(`/games/${gameId}?done=clipplayers`);
		expect((await playersByClip(deps.db, deps.team.id, [1])).get(1)!.map((p) => p.name)).toEqual(["Ewing", "Malone"]);
		await admin("/clips/1/players", formOf([]));
		expect((await playersByClip(deps.db, deps.team.id, [1])).size).toBe(0);
	});
});
