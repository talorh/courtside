import { describe, expect, it } from "vitest";
import { setUnfilmedNoVideo } from "../../../src/features/games/no-video-after.ts";
import { familiesForm, form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { gameForm, seedGame } from "../../helpers/seed.ts";

// A game that's been played keeps who was down for it, whatever the fixture or the team's duties say afterwards.
const slotsOf = async (deps: TestDeps) => (await deps.db.prepare("SELECT week, duty, position, game_id AS g, family_id AS f FROM roster_slots ORDER BY week, duty, game_id, position").all<{ week: string; duty: string; position: number; g: number; f: number }>()).results;
const dutiesAt = async (deps: TestDeps, gameId: number) => (await slotsOf(deps)).filter((s) => s.g === gameId).map((s) => `${s.duty}${s.position} ${s.f}`);
const surnames = async (deps: TestDeps) => new Map((await deps.db.prepare("SELECT id, surname FROM roster_families").all<{ id: number; surname: string }>()).results.map((f) => [f.surname, f.id]));
const families = "Smith\nBruce\nBrown\nLee\nPatel\nJones";

/** This weekend's Friday night and Sunday games, and next Friday's, generated on Thu 15 Oct. */
async function weekend() {
	const deps = createTestDeps();
	const friday = await seedGame(deps, { startsAt: "2026-10-16T18:40" });
	const sunday = await seedGame(deps, { startsAt: "2026-10-18T13:00", opponent: "Eltham" });
	await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Kilsyth" });
	const manager = makeClient(deps);
	await manager("/roster/families", familiesForm(families));
	await manager("/roster/generate", form({}));
	// Saturday 17 Oct, 10am: Friday night's game has been played, Sunday's is still to come.
	deps.now = () => new Date("2026-10-16T23:00:00Z");
	return { deps, manager, friday, sunday, played: await dutiesAt(deps, friday) };
}

describe("a game that's started keeps who was down for it", () => {
	it("set to No video afterwards (its footage lost), it keeps its video duty", async () => {
		const { deps, manager, friday, played } = await weekend();
		expect(played.some((d) => d.startsWith("video1"))).toBe(true);
		expect((await manager(`/fixture/${friday}`, await gameForm(deps, friday, { video: "none" }))).status).toBe(303);
		await makeClient(deps)("/roster");
		expect(await dutiesAt(deps, friday)).toEqual(played);
	});

	it("Save week on this week, after its game was set to No video, keeps that played game's video duty", async () => {
		const { deps, manager, friday, played } = await weekend();
		expect((await manager(`/fixture/${friday}`, await gameForm(deps, friday, { video: "none" }))).status).toBe(303);
		const scorer = Number(played.find((d) => d.startsWith("scoring1"))!.split(" ")[1]);
		const lollies = Number(played.find((d) => d.startsWith("lollies1"))!.split(" ")[1]);
		const r = await manager("/roster/week/2026-10-12", form({ [`scoring1g${friday}`]: String(lollies), [`lollies1g${friday}`]: String(scorer) }));
		expect(r.status).toBe(303);
		const after = await dutiesAt(deps, friday);
		expect(after.find((d) => d.startsWith("video1"))).toBe(played.find((d) => d.startsWith("video1")));
	});

	for (const [off, body] of [["video", { lollies: "1", lolliesLabel: "Lollies" }], ["lollies", { lolliesLabel: "Lollies", video: "1" }]] as const) {
		it(`${off} switched off for the team after the game: Save week on this week keeps the played game's duties, and its card shows them`, async () => {
			const { deps, manager, friday, played } = await weekend();
			expect((await manager("/roster/duties", form(body))).status).toBe(303);
			const page = await (await manager("/roster")).text();
			const card = page.slice(page.indexOf('id="w2026-10-12"'), page.indexOf('id="w2026-10-19"'));
			expect(card).toContain(`name="${off}1g${friday}"`);
			expect((await manager("/roster/week/2026-10-12", form({}))).status).toBe(303);
			expect(await dutiesAt(deps, friday)).toEqual(played);
		});
	}

	it("picking a family for a game still to come leaves the duty it did at a game already played", async () => {
		const { deps, manager, friday, sunday, played } = await weekend();
		const filmer = Number(played.find((d) => d.startsWith("video1"))!.split(" ")[1]);
		expect((await manager("/roster/week/2026-10-12", form({ [`scoring1g${sunday}`]: String(filmer) }))).status).toBe(303);
		expect(await dutiesAt(deps, friday)).toEqual(played);
		expect(await dutiesAt(deps, sunday)).toContain(`scoring1 ${filmer}`);
	});

	it("Scorers only after a played game with lollies: the game still to come wants no lollies", async () => {
		const { manager, sunday } = await weekend();
		await manager("/roster/week/2026-10-12/scorers-only", form({}));
		const page = await (await manager("/roster")).text();
		const card = page.slice(page.indexOf('id="w2026-10-12"'), page.indexOf('id="w2026-10-19"'));
		expect(card).not.toContain(`name="lollies1g${sunday}"`);
	});

	it("Scorers only this week keeps a played game's lollies and video, and drops them from the game still to come", async () => {
		const { deps, manager, friday, sunday, played } = await weekend();
		expect((await manager("/roster/week/2026-10-12/scorers-only", form({}))).status).toBe(303);
		await manager("/roster");
		expect(await dutiesAt(deps, friday)).toEqual(played);
		expect((await dutiesAt(deps, sunday)).map((d) => d.split(" ")[0])).toEqual(["scoring1", "scoring2"]);
	});

	it("switching lollies off for the team keeps them at a played game, and drops them at the games to come", async () => {
		const { deps, manager, friday, sunday, played } = await weekend();
		expect((await manager("/roster/duties", form({ lolliesLabel: "Lollies", video: "1" }))).status).toBe(303);
		await manager("/roster");
		expect(await dutiesAt(deps, friday)).toEqual(played);
		expect((await dutiesAt(deps, sunday)).map((d) => d.split(" ")[0])).toEqual(["scoring1", "scoring2", "video1"]);
		expect((await slotsOf(deps)).filter((s) => s.week > "2026-10-12").some((s) => s.duty === "lollies")).toBe(false);
	});
});

describe("an earlier week the site has since set to No video", () => {
	/** Generated on Thu 1 Oct; on Sat 17 Oct the 9 Oct game, never filmed, has gone No video by the 5-minute job. */
	async function unfilmed() {
		const deps = createTestDeps(new Date("2026-10-01T00:00:00Z"));
		const game = await seedGame(deps, { startsAt: "2026-10-09T18:40" });
		await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Eltham" });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm(families));
		await manager("/roster/generate", form({}));
		const before = (await slotsOf(deps)).filter((s) => s.g === game);
		deps.now = () => new Date("2026-10-16T23:00:00Z");
		expect((await setUnfilmedNoVideo(deps, [deps.team])).noVideoSet).toBe(1);
		return { deps, manager, game, before };
	}

	it("still shows who was on video, and its Change offers that duty", async () => {
		const { deps, manager, game, before } = await unfilmed();
		const names = new Map([...(await surnames(deps))].map(([name, id]) => [id, name]));
		const page = await (await manager("/roster")).text();
		const card = page.slice(page.indexOf('id="w2026-10-05"'), page.indexOf('<section class="panel stack" id="duties">'));
		const video = before.find((s) => s.duty === "video")!;
		expect(card).toContain(`<span class="duty-name">Video</span><span class="duty-fams"><span class="duty-fam">${names.get(video.f)}</span>`);
		expect([...card.matchAll(/<select name="([a-z]+\d)g\d+">/g)].map((m) => m[1])).toEqual(["video1", "scoring1", "scoring2", "lollies1"]);
		expect(card).toContain(`<select name="video1g${game}">`);
	});

	it("Save week puts right two families who swapped, and keeps its video duty", async () => {
		const { deps, manager, game, before } = await unfilmed();
		const scorer = before.find((s) => s.duty === "scoring" && s.position === 1)!.f;
		const lollies = before.find((s) => s.duty === "lollies")!.f;
		const r = await manager("/roster/week/2026-10-05", form({ [`scoring1g${game}`]: String(lollies), [`lollies1g${game}`]: String(scorer) }));
		expect(r.status).toBe(303);
		const after = (await slotsOf(deps)).filter((s) => s.g === game);
		expect(after.find((s) => s.duty === "video")?.f).toBe(before.find((s) => s.duty === "video")!.f);
		expect(after.map((s) => `${s.duty}${s.position} ${s.f}`)).toEqual(before.map((s) => `${s.duty}${s.position} ${s.duty === "lollies" ? scorer : s.duty === "scoring" && s.position === 1 ? lollies : s.f}`));
	});
});

describe("Your duty", () => {
	it("matches a two-word surname whole, and the longest surname a name ends with", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'v@x.com', 'Sam Van Dyke', 'watcher'), (?, 'd@x.com', 'Pat Dyke', 'watcher'), (?, 'n@x.com', 'Sam Vandyke', 'watcher')")
			.bind(deps.team.id, deps.team.id, deps.team.id).run();
		await seedGame(deps, { startsAt: "2026-10-23T18:40" });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm("Van Dyke\nDyke\nBruce\nBrown\nLee"));
		await manager("/roster/generate", form({}));
		const yours = async (email: string) => (await (await makeClient(deps, email)("/roster")).text()).match(/Your family \(([^)]+)\)/)?.[1];
		expect(await yours("v@x.com")).toBe("Van Dyke");
		expect(await yours("d@x.com")).toBe("Dyke");
		expect(await yours("n@x.com")).toBeUndefined();
	});

	it("is the family's next game that hasn't started, by tip-off", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam Smith', 'watcher')").bind(deps.team.id).run();
		const fri = await seedGame(deps, { startsAt: "2026-10-16T18:40" });
		const sat = await seedGame(deps, { startsAt: "2026-10-17T09:00", opponent: "Eltham" });
		const sun = await seedGame(deps, { startsAt: "2026-10-18T13:00", opponent: "Kilsyth" });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm(families));
		await manager("/roster/generate", form({}));
		// The weekend by hand: Smith on Friday's lollies, Saturday's video and Sunday's scoring.
		const id = await surnames(deps);
		const [smith, bruce, brown, lee, patel, jones] = ["Smith", "Bruce", "Brown", "Lee", "Patel", "Jones"].map((s) => id.get(s)!);
		const weekend = [[fri, "lollies", 1, smith], [fri, "video", 1, bruce], [fri, "scoring", 1, brown], [fri, "scoring", 2, lee],
			[sat, "video", 1, smith], [sat, "scoring", 1, patel], [sat, "scoring", 2, jones], [sat, "lollies", 1, bruce],
			[sun, "scoring", 1, smith], [sun, "scoring", 2, brown], [sun, "video", 1, lee], [sun, "lollies", 1, patel]] as const;
		await deps.db.batch([deps.db.prepare("DELETE FROM roster_slots WHERE team_id = ?").bind(deps.team.id),
			...weekend.map(([g, duty, position, f]) => deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-10-12', ?, ?, ?, ?)").bind(deps.team.id, duty, position, g, f))]);
		deps.now = () => new Date("2026-10-16T09:00:00Z"); // Friday 8pm: Friday night's game under way
		const page = await (await makeClient(deps, "p@x.com")("/roster")).text();
		expect(page).toContain("Your family (Smith) is on video at the Sat 17 Oct, 9:00am game in the week of Mon 12 Oct.");
		deps.now = () => new Date("2026-10-17T02:00:00Z"); // Saturday 1pm: Sunday's scoring is next
		expect(await (await makeClient(deps, "p@x.com")("/roster")).text()).toContain("Your family (Smith) is on scoring at the Sun 18 Oct, 1:00pm game in the week of Mon 12 Oct.");
		deps.now = () => new Date("2026-10-18T03:00:00Z"); // Sunday 2pm: nothing left
		expect(await (await makeClient(deps, "p@x.com")("/roster")).text()).toContain("Your family (Smith) has no upcoming duties.");
	});
});
