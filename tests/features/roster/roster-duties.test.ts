import { describe, expect, it } from "vitest";
import { getRosterDuties } from "../../../src/features/roster/roster-repository.ts";
import { familiesForm, form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";
import { sheetRows } from "../../helpers/unzip.ts";
import { addTeam, G14_5 } from "../../helpers/two-teams.ts";

// Today is Thu 15 Oct 2026: this week is the week of Mon 12 Oct. Last week (5 Oct) had a game too.
const slots = async (deps: TestDeps, where = "1 = 1") =>
	(await deps.db.prepare(`SELECT week, duty, position FROM roster_slots WHERE ${where} ORDER BY week, duty, position`).all<{ week: string; duty: string; position: number }>()).results;

async function rostered() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'c@x.com', 'coach')").bind(deps.team.id).run();
	const lastWeek = await seedGame(deps, { startsAt: "2026-10-09T18:40" });
	await seedGame(deps, { startsAt: "2026-10-16T18:40", opponent: "Lakeside" });
	await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Riverton" });
	const manager = makeClient(deps);
	await manager("/roster/families", familiesForm("Smith\nBruce\nBrown\nLee\nPatel\nJones"));
	// Last week's duties were done: as the roster stood then, with its lollies.
	await deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-10-05', 'lollies', 1, ?, 1), (?, '2026-10-05', 'scoring', 1, ?, 2)").bind(deps.team.id, lastWeek, deps.team.id, lastWeek).run();
	await manager("/roster/generate", form({}));
	return { deps, manager };
}

describe("the roster's duties, per team (a team may not do lollies)", () => {
	it("are two scorers, lollies and video for a team that hasn't chosen (B12.1 as it's always been)", async () => {
		const deps = createTestDeps();
		expect(await getRosterDuties(deps.db, deps.team.id)).toEqual({ lollies: true, lolliesLabel: "Lollies", lolliesFamily: null, video: true, videoFamily: null });
	});

	it("lollies off: none from this week on, in the weeks, the week's form, the message and the spreadsheet; last week keeps its", async () => {
		const { deps, manager } = await rostered();
		const saved = await manager("/roster/duties", form({ video: "1" }));
		expect([saved.status, saved.headers.get("Location")]).toEqual([303, "/roster?done=duties#duties"]);
		expect(await slots(deps, "duty = 'lollies'")).toEqual([{ week: "2026-10-05", duty: "lollies", position: 1 }]);
		const page = await (await manager("/roster")).text();
		expect(page).toContain("At every game, two families keep score and one films the game");
		// This week's form offers no lollies; earlier weeks keep theirs, as done.
		const form14 = page.slice(page.indexOf('action="/roster/week/2026-10-12"'));
		expect(form14.slice(0, form14.indexOf("</form>"))).not.toContain('name="lollies1"');
		await manager("/roster/generate", form({}));
		expect(await slots(deps, "duty = 'lollies' AND week >= '2026-10-12'")).toEqual([]);
		const message = await (await manager("/roster/week/2026-10-12/message")).text();
		expect(message).toContain("Scorers:");
		expect(message).not.toContain("Lollies");
		const rows = sheetRows(new Uint8Array(await (await manager("/roster/export.xlsx")).arrayBuffer()));
		expect(rows[0]).toEqual(["Week of", "Game", "Venue", "Scoring", "Video"]);
	});

	it("the Roster's own words name only the team's duties: its heading and How duties are shared", async () => {
		const { manager } = await rostered();
		const words = async () => {
			const page = await (await manager("/roster")).text();
			return { head: /<div class="pagehead"><div class="eyebrow">([^<]*)<\/div><h1>Roster<\/h1>/.exec(page)?.[1], how: page.slice(page.indexOf("How duties are shared"), page.indexOf("Duties per family")) };
		};
		expect(await words()).toMatchObject({ head: "Scoring, lollies and video", how: expect.stringContaining("fewer video turns") });
		await manager("/roster/duties", form({ lollies: "1", lolliesLabel: "Oranges" }));
		const oranges = await words();
		expect(oranges.head).toBe("Scoring and Oranges");
		expect(oranges.how).not.toMatch(/lollies|video/i);
		await manager("/roster/duties", form({ video: "1" }));
		const noExtra = await words();
		expect(noExtra.head).toBe("Scoring and video");
		expect(noExtra.how).not.toContain("lollies");
		expect(noExtra.how).toContain("fewer video turns");
	});

	it("back on, the roster fills lollies again from this week", async () => {
		const { deps, manager } = await rostered();
		await manager("/roster/duties", form({ video: "1" }));
		await manager("/roster/duties", form({ lollies: "1", video: "1" }));
		expect((await slots(deps, "duty = 'lollies' AND week >= '2026-10-12'")).map((s) => s.week)).toEqual(["2026-10-12", "2026-10-19"]);
	});

	it("always two scorers; video off too leaves just them and the lollies", async () => {
		const { deps, manager } = await rostered();
		await manager("/roster/duties", form({ lollies: "1" }));
		expect(await slots(deps, "week >= '2026-10-12'")).toEqual([
			{ week: "2026-10-12", duty: "lollies", position: 1 }, { week: "2026-10-12", duty: "scoring", position: 1 }, { week: "2026-10-12", duty: "scoring", position: 2 },
			{ week: "2026-10-19", duty: "lollies", position: 1 }, { week: "2026-10-19", duty: "scoring", position: 1 }, { week: "2026-10-19", duty: "scoring", position: 2 },
		]);
		expect(await (await manager("/roster")).text()).toContain("At every game, two families keep score and one brings the lollies.");
	});

	it("is the team manager's, for their own team only", async () => {
		const { deps, manager } = await rostered();
		expect((await makeClient(deps, "c@x.com")("/roster/duties", form({ video: "1" }))).status).toBe(403);
		await addTeam(deps.db, G14_5);
		await manager("/roster/duties", form({ video: "1" }));
		expect(await getRosterDuties(deps.db, G14_5.id)).toMatchObject({ lollies: true, video: true });
		expect(await getRosterDuties(deps.db, deps.team.id)).toMatchObject({ lollies: false, video: true });
		expect((await manager("/roster/duties", form({ lollies: "yes please" }))).status).toBe(400);
	});

	it("shows the team manager what's on, and nobody else the panel", async () => {
		const { deps, manager } = await rostered();
		await manager("/roster/duties", form({ video: "1" }));
		const page = await (await manager("/roster")).text();
		expect(page).toContain('<section class="panel stack" id="duties"');
		expect(page).toMatch(/<input type="checkbox" name="lollies" value="1">/);
		expect(page).toMatch(/<input type="checkbox" name="video" value="1" checked>/);
		expect(await (await makeClient(deps, "c@x.com")("/roster")).text()).not.toContain('id="duties"');
	});

	it("lets the team manager name the extra duty (Lollies unless they change it)", async () => {
		const { deps, manager } = await rostered();
		await manager("/roster/duties", form({ lollies: "1", lolliesLabel: " Lolly bags ", video: "1" }));
		expect(await getRosterDuties(deps.db, deps.team.id)).toMatchObject({ lollies: true, lolliesLabel: "Lolly bags" });
		const page = await (await manager("/roster")).text();
		expect(page).toContain('<span class="duty-name">Lolly bags</span>');
		expect(await (await manager("/roster/week/2026-10-12/message")).text()).toContain("Lolly bags:");
		expect(sheetRows(new Uint8Array(await (await manager("/roster/export.xlsx")).arrayBuffer()))[0]).toEqual(["Week of", "Game", "Venue", "Scoring", "Lolly bags", "Video"]);
		expect((await manager("/roster/duties", form({ lollies: "1", lolliesLabel: "   " }))).status).toBe(400);
	});

	it("gives a duty to one family every week if the team manager says so, and that family no other duty (a parent who films every game instead of scoring)", async () => {
		const { deps, manager } = await rostered();
		const lee = (await deps.db.prepare("SELECT id FROM roster_families WHERE surname = 'Lee'").first<number>("id"))!;
		await manager("/roster/duties", form({ lollies: "1", video: "1", videoFamily: String(lee) }));
		const next = (await deps.db.prepare("SELECT duty, family_id AS f FROM roster_slots WHERE week >= '2026-10-19' ORDER BY week, duty, position").all<{ duty: string; f: number }>()).results;
		expect(next.filter((s) => s.duty === "video").map((s) => s.f)).toEqual([lee]);
		expect(next.filter((s) => s.duty !== "video").some((s) => s.f === lee)).toBe(false);
		expect(await (await manager("/roster")).text()).toContain("At every game, two families keep score, one brings the lollies and the Lee family films the game");
		await manager("/roster/generate", form({}));
		expect((await deps.db.prepare("SELECT family_id AS f FROM roster_slots WHERE week >= '2026-10-19' AND duty = 'video'").all<{ f: number }>()).results.map((s) => s.f)).toEqual([lee]);
	});

	it("leaves a family on one duty every week out of the fairness verdict, which the roster can't even out", async () => {
		const { deps, manager } = await rostered();
		for (const day of ["2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20"]) await seedGame(deps, { startsAt: `${day}T18:40` });
		const lee = (await deps.db.prepare("SELECT id FROM roster_families WHERE surname = 'Lee'").first<number>("id"))!;
		await manager("/roster/duties", form({ lollies: "1", video: "1", videoFamily: String(lee) }));
		const page = await (await manager("/roster")).text();
		expect(page).toContain('<p class="fm-verdict fm-good" role="status"><b>Fair:</b>');
		expect(page).toContain("A family on one duty every week has no other, so it isn&#39;t in the fair shares.");
	});

	it("can't give both duties to the same family, or to a family that isn't on the roster", async () => {
		const { deps, manager } = await rostered();
		const lee = (await deps.db.prepare("SELECT id FROM roster_families WHERE surname = 'Lee'").first<number>("id"))!;
		const both = await manager("/roster/duties", form({ lollies: "1", lolliesFamily: String(lee), video: "1", videoFamily: String(lee) }));
		expect(both.status).toBe(400);
		expect(await both.text()).toContain("A family can only do one duty a week.");
		expect((await manager("/roster/duties", form({ video: "1", videoFamily: "99999" }))).status).toBe(400);
		expect(await getRosterDuties(deps.db, deps.team.id)).toMatchObject({ lolliesFamily: null, videoFamily: null });
	});
});
