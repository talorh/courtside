import { describe, expect, it } from "vitest";
import { listGamesWithVideoStatus } from "../../../src/features/games/games-repository.ts";
import { familiesForm, form, makeClient } from "../../helpers/app.ts";
import { countingDb } from "../../helpers/counting-db.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";
import { sheetRows } from "../../helpers/unzip.ts";

// Today is Thu 15 Oct 2026: this week is the week of Mon 12 Oct.
const slotsOf = async (deps: TestDeps) => (await deps.db.prepare("SELECT week, duty, position, game_id AS g, family_id AS f FROM roster_slots ORDER BY week, duty, game_id, position").all<{ week: string; duty: string; position: number; g: number; f: number }>()).results;
/** The id of the game on a day ("2026-10-23"). */
const gameOn = async (deps: TestDeps, day: string) => (await deps.db.prepare("SELECT id FROM games WHERE starts_at LIKE ? AND deleted_at IS NULL").bind(`${day}%`).first<number>("id"))!;
const setByHand = async (deps: TestDeps) => (await deps.db.prepare("SELECT week, duty, position, family_id AS f FROM roster_slots WHERE by_hand = 1 ORDER BY week, duty, position").all<{ week: string; duty: string; position: number; f: number }>()).results;
const families = ["Smith", "Bruce", "Brown", "Lee", "Patel", "Jones"];

async function generated() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam Smith', 'watcher'), (?, 'c@x.com', 'Coach', 'coach')").bind(deps.team.id, deps.team.id).run();
	await seedGame(deps, { startsAt: "2026-10-16T18:40" });
	await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Riverton Wolves" });
	await seedGame(deps, { startsAt: "2026-10-31T09:00", competition: "Tournament", opponent: "Pine Valley" });
	await seedGame(deps, { startsAt: "2026-11-01T13:00", competition: "Tournament", opponent: "Northside" });
	const manager = makeClient(deps);
	await manager("/roster/families", familiesForm(`${families.join("\n")}\nsmith\n`));
	await manager("/roster/generate", form({}));
	return { deps, manager };
}

describe("the roster as an Excel file", () => {
	it("Watch and film, coaches and team managers download the season's weeks as an .xlsx; Watch only can't", async () => {
		const { deps, manager } = await generated();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'f@x.com', 'filmer')").bind(deps.team.id).run();
		await manager("/roster");
		const res = await makeClient(deps, "f@x.com")("/roster/export.xlsx");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
		expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="roster-2026-27.xlsx"');
		const rows = sheetRows(new Uint8Array(await res.arrayBuffer()));
		const names = new Map((await deps.db.prepare("SELECT id, surname FROM roster_families").all<{ id: number; surname: string }>()).results.map((f) => [f.id, f.surname]));
		const on = async (week: string, duty: string) => (await slotsOf(deps)).filter((s) => s.week === week && s.duty === duty).map((s) => names.get(s.f)).join(", ");
		expect(rows[0]).toEqual(["Week of", "Game", "Venue", "Scoring", "Lollies", "Video"]);
		expect(rows[2]).toEqual(["Mon 19 Oct 2026", "Fri 23 Oct, 6:40pm · Round 9 · vs Riverton Wolves", "Lakeside Basketball Stadium, Ct 3",
			await on("2026-10-19", "scoring"), await on("2026-10-19", "lollies"), await on("2026-10-19", "video")]);
		expect(rows[3]![1]).toBe("Sat 31 Oct, 9:00am · 9 · vs Pine Valley\nSun 1 Nov, 1:00pm · 9 · vs Northside");
		// Two scorers a game: a weekend with two games has a line for each.
		expect(rows.slice(1).every((r) => String(r[3]).split("\n").every((line) => line.split(": ").at(-1)!.split(", ").length === 2) && r[4] && r[5])).toBe(true);
		expect(String(rows[3]![3]).split("\n").map((l) => l.split(": ")[0])).toEqual(["Sat 31 Oct, 9:00am", "Sun 1 Nov, 1:00pm"]);
		expect((await makeClient(deps, "c@x.com")("/roster/export.xlsx")).status).toBe(200);
		expect((await makeClient(deps, "p@x.com")("/roster/export.xlsx")).status).toBe(403);
		expect(await (await makeClient(deps, "f@x.com")("/roster")).text()).toContain('<a class="btn" href="/roster/export.xlsx">Export to Excel</a>');
		expect(await (await makeClient(deps, "p@x.com")("/roster")).text()).not.toContain("/roster/export.xlsx");
	});
	it("says No video for a week with no filming", async () => {
		const { manager } = await generated();
		await manager("/roster/week/2026-10-26/no-video", form({}));
		const rows = sheetRows(new Uint8Array(await (await manager("/roster/export.xlsx")).arrayBuffer()));
		const tournament = rows.find((r) => r[0] === "Mon 26 Oct 2026")!;
		expect(tournament[5]).toBe("No video");
		expect(tournament[1]).toContain("vs Pine Valley (No video)");
	});
});

describe("a whole season's roster", () => {
	it("Generate fills 30 weeks for 12 families in a few database trips, each statement inside D1's limits", async () => {
		const deps = createTestDeps();
		for (let i = 0; i < 30; i++) await seedGame(deps, { startsAt: new Date(Date.UTC(2026, 9, 16 + 7 * i)).toISOString().slice(0, 10) + "T18:40", opponent: `Team ${i}` });
		const { db, counter } = countingDb(deps.db);
		const manager = makeClient({ ...deps, db });
		await manager("/roster/families", familiesForm(Array.from({ length: 12 }, (_, i) => `Family${i}`).join("\n")));
		counter.trips = 0;
		expect((await manager("/roster/generate", form({}))).status).toBe(303);
		expect((await slotsOf(deps)).length).toBe(120);
		expect(counter.trips).toBeLessThan(20);
		expect(counter.mostParams).toBeLessThanOrEqual(100);
		expect(counter.biggestBatch).toBeLessThanOrEqual(150);
	});
});

describe("roster", () => {
	it("is empty until the team manager adds families and generates it", async () => {
		const deps = createTestDeps();
		await seedGame(deps, { startsAt: "2026-10-23T18:40" });
		const page = await (await makeClient(deps)("/roster")).text();
		expect(page).toContain("Add the families below, then tap Generate roster.");
		expect(await slotsOf(deps)).toEqual([]);
	});
	it("adds families a row at a time: one surname a row, + Add another, × to drop one", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		const page = await (await manager("/roster")).text();
		expect(page).toContain('<form class="stack" id="addfamilies" method="post" action="/roster/families" data-rows>');
		expect(page.match(/<li class="frow"><input name="surname"/g)).toHaveLength(1); // one empty row to start
		expect(page).toContain('placeholder="Curry"'); // an NBA surname, as everywhere Help shows
		expect(page).toContain('<button class="btn quiet" type="button" data-add-row hidden>+ Add another</button><button class="btn">Add families</button>');
		expect(page).toContain('<script type="module" src="/rows.js"></script>');
		// Blank rows are skipped, spaces tidied, a name already there (any case) or twice is added once, and a pasted list
		// in one row is split.
		const added = await manager("/roster/families", familiesForm("  Bruce \n\nfreddie\nBRUCE\nDaniel,  van  Dyke\n"));
		expect(added.headers.get("Location")).toBe("/roster?done=added#families");
		const names = (await deps.db.prepare("SELECT surname FROM roster_families ORDER BY id").all<{ surname: string }>()).results.map((r) => r.surname);
		expect(names).toEqual(["Bruce", "freddie", "Daniel", "van Dyke"]);
		// Nothing in any row: nothing added, and the page says so.
		const none = await manager("/roster/families", familiesForm("\n  \n"));
		expect(none.status).toBe(400);
		expect(await none.text()).toContain("Type a family&#39;s surname.");
		// A name too long to be one surname is refused, not dropped without a word.
		const long = await manager("/roster/families", familiesForm(`Lee\n${"x".repeat(41)}`));
		expect([long.status, (await long.text()).includes("A surname can be up to 40 letters.")]).toEqual([400, true]);
		expect(await deps.db.prepare("SELECT count(*) AS n FROM roster_families").first<number>("n")).toBe(4);
		// A pasted list that would make the roster bigger than any team is refused whole, with the most it can be.
		const many = await manager("/roster/families", familiesForm(Array.from({ length: 57 }, (_, i) => `Family${i}`).join(",")));
		expect([many.status, (await many.text()).includes("A roster can have up to 60 families")]).toEqual([400, true]);
		expect(await deps.db.prepare("SELECT count(*) AS n FROM roster_families").first<number>("n")).toBe(4);
		const fits = await manager("/roster/families", familiesForm(Array.from({ length: 56 }, (_, i) => `Family${i}`).join(",")));
		expect(fits.status).toBe(303);
	});
	it("gives each week with games two scorers a game, lollies and video, from different families", async () => {
		const { deps } = await generated();
		const slots = await slotsOf(deps);
		expect(new Set(slots.map((s) => s.week))).toEqual(new Set(["2026-10-12", "2026-10-19", "2026-10-26"]));
		for (const week of ["2026-10-12", "2026-10-19"]) {
			const inWeek = slots.filter((s) => s.week === week);
			expect(inWeek.map((s) => `${s.duty}${s.position}`).sort()).toEqual(["lollies1", "scoring1", "scoring2", "video1"]);
			expect(new Set(inWeek.map((s) => s.f)).size).toBe(4);
			// A week's one game's duties are that game's.
			expect(inWeek.every((s) => s.g > 0)).toBe(true);
		}
		// The tournament weekend: each of its two games has its own two scorers and its own video, six
		// families in all, and no lollies until All duties this week (a tournament is scorers only).
		const weekend = slots.filter((s) => s.week === "2026-10-26");
		expect(weekend.map((s) => `${s.duty}${s.position}`).sort()).toEqual(["scoring1", "scoring1", "scoring2", "scoring2", "video1", "video1"]);
		expect(new Set(weekend.map((s) => s.f)).size).toBe(6);
		const [sat, sun] = [await gameOn(deps, "2026-10-31"), await gameOn(deps, "2026-11-01")];
		expect(weekend.filter((s) => s.duty === "scoring").map((s) => s.g).sort()).toEqual([sat, sat, sun, sun].sort());
		expect(weekend.filter((s) => s.duty === "video").map((s) => s.g).sort()).toEqual([sat, sun].sort());
		expect((await deps.db.prepare("SELECT count(*) AS n FROM roster_families WHERE removed_at IS NULL").first<{ n: number }>())?.n).toBe(6);
	});
	it("the team manager's Change shows each duty as set by hand or the roster's pick, and the week says what's set by hand", async () => {
		const { deps, manager } = await generated();
		const names = new Map((await deps.db.prepare("SELECT id, surname FROM roster_families").all<{ id: number; surname: string }>()).results.map((f) => [f.id, f.surname]));
		const smith = [...names].find(([, n]) => n === "Smith")![0];
		const game = await gameOn(deps, "2026-10-23");
		await manager("/roster/week/2026-10-19", form({ [`video1g${game}`]: String(smith) }));
		const page = await (await manager("/roster")).text();
		const card = page.slice(page.indexOf('id="w2026-10-19"'), page.indexOf('id="w2026-10-26"'));
		const lollies = (await slotsOf(deps)).find((s) => s.week === "2026-10-19" && s.duty === "lollies")!.f;
		expect(card).toContain(`<label>Video<select name="video1g${game}"><option value="">Roster's pick</option><option value=`);
		expect(card).toContain(`<option value="${smith}" selected>Smith</option></select></label>`);
		expect(card.match(/ selected>/g)).toHaveLength(1);
		expect(card).toContain(`<label>Lollies<select name="lollies1g${game}"><option value="">Roster's pick: ${names.get(lollies)}</option>`);
		// A week's one game's fields carry its id, without saying which game; a weekend's say which, for every duty.
		expect(card).toContain(`<label>Scoring 1<select name="scoring1g${game}">`);
		const weekend = page.slice(page.indexOf('id="w2026-10-26"'), page.indexOf("</ol>", page.indexOf('id="w2026-10-26"')));
		expect(weekend).toContain(`<label>Scoring 1 · Sat 31 Oct, 9:00am<select name="scoring1g${await gameOn(deps, "2026-10-31")}">`);
		expect(weekend).toContain(`<label>Scoring 2 · Sun 1 Nov, 1:00pm<select name="scoring2g${await gameOn(deps, "2026-11-01")}">`);
		expect(weekend).toContain(`<label>Video · Sun 1 Nov, 1:00pm<select name="video1g${await gameOn(deps, "2026-11-01")}">`);
		expect(weekend).not.toContain("<label>Lollies");
		expect(card).not.toContain("required");
		expect(card).toContain('<p class="small duty-hand">Set by hand: Video.</p>');
		expect(page).toContain("Duties set by hand stay as they are");
		expect(await (await makeClient(deps, "p@x.com")("/roster")).text()).not.toContain("Set by hand");
	});
	it("keeps each week short: a tournament weekend's venue shows once, and each duty's name sits with its families", async () => {
		const { deps } = await generated();
		const page = await (await makeClient(deps, "p@x.com")("/roster")).text();
		const start = page.indexOf('id="w2026-10-26"');
		const card = page.slice(start, page.indexOf("</ol>", start));
		expect(card.match(/Lakeside Basketball Stadium, Ct 3/g)).toHaveLength(1);
		// Each game's two scorers sit under that game; the week's lollies and video below.
		const scoring = /<div class="duty"><span class="duty-name">Scoring<\/span><span class="duty-fams"><span class="duty-fam( mine)?">\w+<\/span>, <span class="duty-fam( mine)?">\w+<\/span><\/span><\/div>/g;
		expect(card.match(scoring)).toHaveLength(2);
		expect(card.indexOf("vs Pine Valley")).toBeLessThan(card.search(scoring));
		expect(card.indexOf("vs Northside")).toBeLessThan(card.lastIndexOf('<span class="duty-name">Scoring</span>'));
		expect(card.lastIndexOf('<span class="duty-name">Scoring</span>')).toBeLessThan(card.indexOf('<span class="duty-name">Lollies</span>'));
	});
	it("shows the next six weeks; the ones after fold away under Later weeks, as earlier ones do", async () => {
		const deps = createTestDeps();
		for (let i = 0; i < 10; i++) await seedGame(deps, { startsAt: new Date(Date.UTC(2026, 9, 16 + 7 * i)).toISOString().slice(0, 10) + "T18:40", opponent: `Team ${i}` });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm(families.join("\n")));
		await manager("/roster/generate", form({}));
		const page = await (await manager("/roster")).text();
		const later = page.indexOf('<details class="panel duty-later"><summary>Later weeks (4)</summary>');
		expect(later).toBeGreaterThan(0);
		expect(page.indexOf('id="w2026-11-16"')).toBeLessThan(later); // the sixth week, this one included
		expect(page.indexOf('id="w2026-11-23"')).toBeGreaterThan(later);
		expect([...page.matchAll(/id="w(\d{4}-\d{2}-\d{2})"/g)]).toHaveLength(10);
	});
	it("Save week changes only the duties picked: an earlier week stays as it was, a family since taken off included", async () => {
		const { deps, manager } = await generated();
		await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Last Week" });
		await manager("/roster/families", familiesForm("Rivers"));
		const ids = new Map((await deps.db.prepare("SELECT id, surname FROM roster_families").all<{ id: number; surname: string }>()).results.map((f) => [f.surname, f.id]));
		const names = new Map([...ids].map(([name, id]) => [id, name]));
		// Last week Rivers filmed, then came off the roster.
		const lastWeek = await gameOn(deps, "2026-10-09");
		for (const [duty, position, name] of [["video", 1, "Rivers"], ["scoring", 1, "Smith"], ["scoring", 2, "Bruce"], ["lollies", 1, "Brown"]] as const) {
			await deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-10-05', ?, ?, ?, ?)").bind(deps.team.id, duty, position, lastWeek, ids.get(name)).run();
		}
		await manager(`/roster/families/${ids.get("Rivers")}/remove`, form({ confirm: "yes" }));
		// Sam puts right last week's second scorer; the rest is left as the roster's pick.
		await manager("/roster/week/2026-10-05", form({ [`scoring2g${lastWeek}`]: String(ids.get("Lee")) }));
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-10-05").map((s) => `${s.duty}${s.position}g${s.g === lastWeek ? "G" : s.g} ${names.get(s.f)}`))
			.toEqual(["lollies1gG Brown", "scoring1gG Smith", "scoring2gG Lee", "video1gG Rivers"]);
	});
	it("Generate gives a duty left with a family that's off the roster (Rivers's one-off) to one on it", async () => {
		const { deps, manager } = await generated();
		await manager("/roster/families", familiesForm("Rivers"));
		const rivers = (await deps.db.prepare("SELECT id FROM roster_families WHERE surname = 'Rivers'").first<{ id: number }>())!.id;
		await manager(`/roster/families/${rivers}/remove`, form({ confirm: "yes" }));
		// Rivers's one-off, put in straight in the database: on video next week while off the roster.
		await deps.db.batch([
			deps.db.prepare("DELETE FROM roster_slots WHERE team_id = ? AND week = '2026-10-19' AND duty = 'video'").bind(deps.team.id),
			deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-10-19', 'video', 1, ?, ?)").bind(deps.team.id, await gameOn(deps, "2026-10-23"), rivers),
		]);
		// Saving the week leaves it, as the roster's pick it shows...
		await manager("/roster/week/2026-10-19", form({}));
		expect((await slotsOf(deps)).find((s) => s.week === "2026-10-19" && s.duty === "video")?.f).toBe(rivers);
		// ...and Generate shares it out to a family on the roster.
		expect((await manager("/roster/generate", form({}))).status).toBe(303);
		const week = (await slotsOf(deps)).filter((s) => s.week === "2026-10-19");
		expect(week.map((s) => `${s.duty}${s.position}`)).toEqual(["lollies1", "scoring1", "scoring2", "video1"]);
		expect(week.some((s) => s.f === rivers)).toBe(false);
		expect(new Set(week.map((s) => s.f)).size).toBe(4);
	});
	it("this week's game is always at the top, then the weeks after it in date order; past weeks fold away below", async () => {
		const { deps } = await generated();
		await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Last Week" });
		const page = await (await makeClient(deps, "p@x.com")("/roster")).text();
		const order = [...page.matchAll(/id="w(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
		expect(order).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-10-05"]);
		expect(page.indexOf('id="w2026-10-12"')).toBeLessThan(page.indexOf('<span class="role c">This week</span>'));
		expect(page.indexOf("<summary>Earlier weeks</summary>")).toBeLessThan(page.indexOf('id="w2026-10-05"'));
	});
	it("families and coaches can see it (yours highlighted), but only the team manager changes it", async () => {
		const { deps } = await generated();
		const page = await (await makeClient(deps, "p@x.com")("/roster")).text();
		expect(page).toMatch(/<a href="\/roster" class="big grey" aria-current="page"><svg[^>]*>[\s\S]*?<\/svg>Roster<\/a>/);
		expect(page).toMatch(/Your family \(Smith\) (is on|has no upcoming)/);
		expect(page).toContain("two families keep score, one brings the lollies and one films the game, unless filming isn't allowed. A tournament weekend starts as scorers only. Can't make it? Swap with another family, then let Sam know.");
		// Everyone gets the fairness dashboard; only the team manager gets the families panel, just above it.
		expect(page).toContain('<h2 id="fm-h">Roster fairness</h2>');
		expect(page).toContain("<b>Fair:</b> every family has as close as possible to an equal share of duties.");
		expect(page).toContain('<span class="fm-label">Duties per family</span>');
		expect(page).toMatch(/<th scope="row">Smith<\/th>\s*(<td>\d<\/td>){3}<td class="fm-total">\d<\/td>/);
		expect(page).not.toContain("All families");
		expect(page).toContain('<span class="fm-label">Week by week</span>');
		expect(page).not.toMatch(/fm-ring|%<\/text>/);
		expect(page).not.toContain("Families on the roster");
		expect(page).not.toContain("Generate roster</button>");
		expect((await makeClient(deps, "c@x.com")("/roster")).status).toBe(200);
		for (const path of ["/roster/generate", "/roster/families", "/roster/week/2026-10-19"]) {
			expect((await makeClient(deps, "c@x.com")(path, familiesForm("X"))).status).toBe(403);
		}
		const admin = await (await makeClient(deps)("/roster")).text();
		expect(admin).toContain("Generate roster</button>");
		expect(admin.indexOf("Families on the roster")).toBeLessThan(admin.indexOf("Roster fairness"));
	});
	it("reads sensibly with a No video tournament and a family taken off: fewer video turns, past duties kept", async () => {
		const { deps, manager } = await generated();
		await manager("/roster/week/2026-10-26/no-video", form({}));
		// Smith scored at last week's game, then was taken off: their upcoming duties go to others, that one stays.
		const smith = await deps.db.prepare("SELECT id FROM roster_families WHERE surname = 'Smith'").first<number>("id");
		const lastWeek = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Last Week" });
		await deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-10-05', 'scoring', 1, ?, ?)").bind(deps.team.id, lastWeek, smith).run();
		await manager(`/roster/families/${smith}/remove`, form({ confirm: "yes" }));
		const page = await (await manager("/roster")).text();
		expect(page).toContain("· 5 families · 4 weeks with games, 1 with no video</p>");
		expect(page).toContain("A week with no filming (No video) only needs scorers and lollies, so there are fewer video turns to go round.");
		// Taken off: not counted in the fairness table or chart at all, but still shown on the week they did.
		const fairness = page.slice(page.indexOf('<section class="fm"'));
		expect(fairness).not.toContain("Smith");
		expect(page.slice(page.indexOf('id="w2026-10-05"'), page.indexOf('<section class="fm"'))).toContain('<span class="duty-fam">Smith</span>');
		expect(page).toMatch(/<b>(Fair|Not even yet):<\/b>/);
	});
	it("the week by week chart keeps one square size for a whole season, with month names, and opens at this week", async () => {
		const deps = createTestDeps();
		for (let i = 0; i < 46; i++) await seedGame(deps, { startsAt: new Date(Date.UTC(2026, 9, 16 + 7 * i)).toISOString().slice(0, 10) + "T18:40", opponent: `Team ${i}` });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm(families.join("\n")));
		await manager("/roster/generate", form({}));
		const page = await (await manager("/roster")).text();
		expect(page).toContain('<svg class="fm-weeks" width="646" height="136"'); // 46 weeks × 14px, 6 families × 20px under the months
		for (const m of ["Oct", "Nov", "Dec", "Jan", "Jun", "Aug"]) expect(page).toContain(`>${m}</text>`);
		// Month names never sit closer than two weeks apart (they'd overlap).
		const xs = [...page.matchAll(/<text x="(\d+)" y="11">/g)].map((m) => Number(m[1]));
		expect(xs.every((x, i) => i === 0 || x - xs[i - 1]! >= 28)).toBe(true);
		expect(page).toContain('<div class="fm-scroller" data-now-x="0">'); // this week is the first one
		expect(page).toContain('<script type="module" src="/roster.js"></script>');
	});
	it("a month that starts a week before the next one gives way, rather than the two names overlapping", async () => {
		const deps = createTestDeps(new Date("2026-10-01T00:00:00Z")); // 11am 1 Oct: the new season
		await seedGame(deps, { startsAt: "2026-10-02T18:40", opponent: "A" }); // week of Mon 28 Sep
		await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "B" });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm(families.join("\n")));
		await manager("/roster/generate", form({}));
		const labels = [...(await (await manager("/roster")).text()).matchAll(/<text x="(\d+)" y="11">(\w+)<\/text>/g)].map((m) => m[2]);
		expect(labels).toEqual(["Oct"]);
	});
	it("fills new games' weeks by itself, and drops weeks whose games went", async () => {
		const { deps, manager } = await generated();
		const id = await seedGame(deps, { startsAt: "2026-11-06T18:40", opponent: "Lakeside" });
		await manager("/roster");
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-11-02")).toHaveLength(4);
		await manager(`/fixture/${id}/delete`, form({ confirm: "yes" }));
		await manager("/roster");
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-11-02")).toEqual([]);
	});
	it("No video this week marks the tournament's games and drops the video duty; Video this week undoes it", async () => {
		const { deps, manager } = await generated();
		expect((await manager("/roster/week/2026-10-26/no-video", form({}))).headers.get("Location")).toBe("/roster?done=novideo#w2026-10-26");
		const games = (await listGamesWithVideoStatus(deps.db, deps.team.id)).map((r) => r.game);
		expect(games.filter((g) => g.competition === "Tournament").every((g) => g.noVideo)).toBe(true);
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-10-26").map((s) => s.duty)).not.toContain("video");
		expect(await (await manager("/roster")).text()).toContain('<span class="duty-name">Video</span><span class="duty-fams"><span class="duty-fam empty">No video</span></span>');
		await manager("/roster/week/2026-10-26/video", form({}));
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-10-26").map((s) => s.duty)).toContain("video");
	});
	it("Scorers only this week (a tournament with no lollies and no video) drops the extra duty and the video duty; All duties this week undoes it", async () => {
		const { deps, manager } = await generated();
		const weekend = async () => { const page = await (await manager("/roster")).text(); return page.slice(page.indexOf('id="w2026-10-26"'), page.indexOf("</ol>", page.indexOf('id="w2026-10-26"'))); };
		expect(await weekend()).toContain(">Scorers only this week<");
		// A tournament weekend starts without lollies; its games still have video until the fixture or the team manager says No video.
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-10-26").map((s) => s.duty).sort()).toEqual(["scoring", "scoring", "scoring", "scoring", "video", "video"]);
		expect((await manager("/roster/week/2026-10-26/scorers-only", form({}))).headers.get("Location")).toBe("/roster?done=scorersonly#w2026-10-26");
		const games = (await listGamesWithVideoStatus(deps.db, deps.team.id)).map((r) => r.game);
		expect(games.filter((g) => g.competition === "Tournament").every((g) => g.noVideo)).toBe(true);
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-10-26").map((s) => s.duty).sort()).toEqual(["scoring", "scoring", "scoring", "scoring"]);
		// The other weeks keep their lollies.
		expect((await slotsOf(deps)).filter((s) => s.week === "2026-10-19").map((s) => s.duty)).toContain("lollies");
		const page = await (await manager("/roster?done=scorersonly")).text();
		expect(page).toContain("Scorers only this week: just the two scorers, and its games are marked No video.");
		expect(page).toContain('<span class="duty-name">Lollies</span><span class="duty-fams"><span class="duty-fam empty">No lollies</span></span>');
		expect(page).toContain('<span class="duty-name">Video</span><span class="duty-fams"><span class="duty-fam empty">No video</span></span>');
		expect(await weekend()).toContain(">All duties this week<");
		// The match day message and the spreadsheet say so too.
		expect(await (await manager("/roster/week/2026-10-26/message")).text()).not.toContain("Lollies:");
		const rows = sheetRows(new Uint8Array(await (await manager("/roster/export.xlsx")).arrayBuffer()));
		expect(rows.find((r) => String(r[1]).includes("Pine Valley"))!.slice(4)).toEqual(["No lollies", "No video"]);
		expect((await manager("/roster/week/2026-10-26/all-duties", form({}))).headers.get("Location")).toBe("/roster?done=allduties#w2026-10-26");
		// All duties: each game its own lollies and video too (eight slots for six families: a family takes a second game).
		const all = (await slotsOf(deps)).filter((s) => s.week === "2026-10-26");
		expect(all.map((s) => s.duty).sort()).toEqual(["lollies", "lollies", "scoring", "scoring", "scoring", "scoring", "video", "video"]);
		for (const g of new Set(all.map((s) => s.g))) expect(new Set(all.filter((s) => s.g === g).map((s) => s.f)).size).toBe(4);
		expect((await weekend()).match(/<span class="duty-name">Lollies<\/span>/g)).toHaveLength(2);
		const rows2 = sheetRows(new Uint8Array(await (await manager("/roster/export.xlsx")).arrayBuffer()));
		expect(String(rows2.find((r) => String(r[1]).includes("Pine Valley"))![4]).split("\n").map((l) => l.split(": ")[0])).toEqual(["Sat 31 Oct, 9:00am", "Sun 1 Nov, 1:00pm"]);
		expect((await listGamesWithVideoStatus(deps.db, deps.team.id)).map((r) => r.game).every((g) => !g.noVideo)).toBe(true);
	});
	it("changes a week by hand: a family picked for a duty is set by hand, and comes off any other duty that week", async () => {
		const { deps, manager } = await generated();
		const before = (await slotsOf(deps)).filter((s) => s.week === "2026-10-19");
		const lollies = before.find((s) => s.duty === "lollies")!.f;
		// Sam puts next week's lollies family on video; every other duty is left as the roster's pick.
		const game = await gameOn(deps, "2026-10-23");
		const saved = await manager("/roster/week/2026-10-19", form({ [`scoring1g${game}`]: "", [`scoring2g${game}`]: "", [`lollies1g${game}`]: "", [`video1g${game}`]: String(lollies) }));
		expect(saved.headers.get("Location")).toBe("/roster?done=saved#w2026-10-19");
		const after = (await slotsOf(deps)).filter((s) => s.week === "2026-10-19");
		expect(after.find((s) => s.duty === "video")?.f).toBe(lollies);
		expect(after.find((s) => s.duty === "lollies")?.f).not.toBe(lollies);
		expect(after.filter((s) => s.duty === "scoring")).toEqual(before.filter((s) => s.duty === "scoring"));
		expect(new Set(after.map((s) => s.f)).size).toBe(4);
		expect(await setByHand(deps)).toEqual([{ week: "2026-10-19", duty: "video", position: 1, f: lollies }]);
		// The same family twice on a game, or one that isn't on the roster, is refused; a week with no games isn't there.
		const ids = (await deps.db.prepare("SELECT id FROM roster_families ORDER BY id").all<{ id: number }>()).results.map((r) => String(r.id));
		expect((await manager("/roster/week/2026-10-19", form({ [`scoring1g${game}`]: ids[0]!, [`scoring2g${game}`]: ids[0]! }))).status).toBe(400);
		expect((await manager("/roster/week/2026-10-19", form({ [`video1g${game}`]: "999" }))).status).toBe(400);
		expect((await manager("/roster/week/2026-10-13", form({}))).status).toBe(404);
	});
	it("Generate keeps duties set by hand, this week's too, and shares out everything else around them", async () => {
		const { deps, manager } = await generated();
		const ids = (await deps.db.prepare("SELECT id FROM roster_families ORDER BY id").all<{ id: number }>()).results.map((r) => r.id);
		const sat = await gameOn(deps, "2026-10-31"), first = await gameOn(deps, "2026-10-16");
		await manager("/roster/week/2026-10-26", form({ [`video1g${sat}`]: String(ids[0]) }));
		await manager("/roster/week/2026-10-12", form({ [`lollies1g${first}`]: String(ids[1]) }));
		expect((await manager("/roster/generate", form({}))).status).toBe(303);
		expect(await setByHand(deps)).toEqual([{ week: "2026-10-12", duty: "lollies", position: 1, f: ids[1] }, { week: "2026-10-26", duty: "video", position: 1, f: ids[0] }]);
		const slots = await slotsOf(deps);
		for (const week of ["2026-10-12", "2026-10-19"]) {
			const inWeek = slots.filter((s) => s.week === week);
			expect(inWeek.map((s) => `${s.duty}${s.position}`)).toEqual(["lollies1", "scoring1", "scoring2", "video1"]);
			expect(new Set(inWeek.map((s) => s.f)).size).toBe(4);
		}
		expect(slots.filter((s) => s.week === "2026-10-26")).toHaveLength(6);
		// Left as the roster's pick again: no longer set by hand, so Generate can share it out.
		await manager("/roster/week/2026-10-26", form({ [`video1g${sat}`]: "" }));
		expect((await setByHand(deps)).map((s) => s.week)).toEqual(["2026-10-12"]);
	});
	it("taking a family off hands their upcoming duties to others", async () => {
		const { deps, manager } = await generated();
		const smith = (await deps.db.prepare("SELECT id FROM roster_families WHERE surname = 'Smith'").first<{ id: number }>())!.id;
		await manager(`/roster/families/${smith}/remove`, form({ confirm: "yes" }));
		const slots = await slotsOf(deps);
		expect(slots.some((s) => s.f === smith)).toBe(false);
		expect(slots).toHaveLength(14); // 4, 4, and the weekend's 6
		// Already off (or never on): says so instead of "Family taken off".
		expect((await manager(`/roster/families/${smith}/remove`, form({ confirm: "yes" }))).status).toBe(404);
		expect((await manager("/roster/families/999/remove", form({ confirm: "yes" }))).status).toBe(404);
	});
	it("the database itself refuses a second slot for a family on the same game, whichever duty", async () => {
		const { deps } = await generated();
		const slots = await slotsOf(deps);
		const scoring = slots.find((s) => s.duty === "scoring")!, lollies = slots.find((s) => s.duty === "lollies")!;
		await expect(deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, ?, 'scoring', 9, ?, ?)")
			.bind(deps.team.id, scoring.week, scoring.g, scoring.f).run()).rejects.toThrow(/UNIQUE/);
		await expect(deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, ?, 'video', 9, ?, ?)")
			.bind(deps.team.id, lollies.week, lollies.g, lollies.f).run()).rejects.toThrow(/UNIQUE/);
	});
	it("a weekend with more scoring slots than families gives a family a second game, never the same game twice", async () => {
		const deps = createTestDeps();
		await seedGame(deps, { startsAt: "2026-10-31T09:00", competition: "Tournament", opponent: "A" });
		await seedGame(deps, { startsAt: "2026-10-31T13:00", competition: "Tournament", opponent: "B" });
		await seedGame(deps, { startsAt: "2026-11-01T10:00", competition: "Tournament", opponent: "C" });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm("Smith\nBruce\nBrown\nLee"));
		await manager("/roster/week/2026-10-26/scorers-only", form({}));
		await manager("/roster/generate", form({}));
		const slots = (await slotsOf(deps)).filter((s) => s.week === "2026-10-26");
		expect(slots).toHaveLength(6);
		for (const g of new Set(slots.map((s) => s.g))) expect(new Set(slots.filter((s) => s.g === g).map((s) => s.f)).size).toBe(2);
		const counts = [...new Set(slots.map((s) => s.f))].map((f) => slots.filter((s) => s.f === f).length);
		expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
		// One match day message a game: the weekend has a WhatsApp message for each game, each naming that game alone and
		// its own duties.
		const page = await (await manager("/roster")).text();
		const ids = (await deps.db.prepare("SELECT id FROM games ORDER BY starts_at").all<{ id: number }>()).results.map((r) => r.id);
		for (const [i, when] of ["Sat 31 Oct, 9:00am", "Sat 31 Oct, 1:00pm", "Sun 1 Nov, 10:00am"].entries()) {
			expect(page).toContain(`<a class="btn quiet" href="/roster/week/2026-10-26/message?game=${ids[i]}">WhatsApp message, ${when}</a>`);
		}
		expect(page).not.toContain('href="/roster/week/2026-10-26/message"');
		const second = await (await manager(`/roster/week/2026-10-26/message?game=${ids[1]}`)).text();
		expect(second).toContain("Opponent: B\n");
		expect(second).not.toContain("Opponent: A\n");
		expect(second).not.toContain("Opponent: C\n");
		const names = new Map((await deps.db.prepare("SELECT id, surname FROM roster_families").all<{ id: number; surname: string }>()).results.map((f) => [f.id, f.surname]));
		const scorers = slots.filter((s) => s.g === ids[1]).map((s) => names.get(s.f));
		expect(second).toContain(`💻 Scorers: ${scorers.join(", ")}</textarea>`);
		expect(second).toContain("Saturday 31 October, 1:00pm");
		// The uniform choice keeps the game; a game from another week is no page.
		expect(second).toContain(`<input type="hidden" name="game" value="${ids[1]}">`);
		expect(second).toContain('<div class="eyebrow">Sat 31 Oct, 1:00pm</div>');
		expect((await manager(`/roster/week/2026-10-19/message?game=${ids[1]}`)).status).toBe(404);
		// A family's own line says which game its duty is at.
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'sam@x.com', 'Sam Smith', 'watcher')").bind(deps.team.id).run();
		expect(await (await makeClient(deps, "sam@x.com")("/roster")).text())
			.toMatch(/Your family \(Smith\) is on scoring at the (Sat 31 Oct, 9:00am|Sat 31 Oct, 1:00pm|Sun 1 Nov, 10:00am) game in the week of Mon 26 Oct\./);
		// The week by week chart names both of a family's duties that weekend.
		expect(await (await manager("/roster")).text()).toMatch(/<title>\w+, week of Mon 26 Oct: Scoring and Scoring<\/title>/);
	});
	it("a family taken off and added back keeps its past duties; Generate needs upcoming games", async () => {
		const { deps, manager } = await generated();
		const smith = (await deps.db.prepare("SELECT id FROM roster_families WHERE surname = 'Smith'").first<{ id: number }>())!.id;
		await manager(`/roster/families/${smith}/remove`, form({ confirm: "yes" }));
		await manager("/roster/families", familiesForm("smith"));
		const rows = (await deps.db.prepare("SELECT id, removed_at FROM roster_families WHERE surname = 'Smith' COLLATE NOCASE").all<{ id: number; removed_at: string | null }>()).results;
		expect(rows).toEqual([{ id: smith, removed_at: null }]);
		const empty = createTestDeps();
		await makeClient(empty)("/roster/families", familiesForm("Lee"));
		const res = await makeClient(empty)("/roster/generate", form({}));
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("no upcoming games in the fixture yet");
	});
});
