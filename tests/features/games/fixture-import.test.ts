import { afterEach, describe, expect, it, vi } from "vitest";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";
import { listGamesWithVideoStatus } from "../../../src/features/games/games-repository.ts";
import { parseDate, parseTime, readFixtureCsv, SAMPLE_CSV } from "../../../src/features/games/fixture-csv.ts";
import { pageText } from "../../../src/features/games/fixture-link.ts";
import { listPlayhqFixtures } from "../../../src/features/games/playhq-repository.ts";
import { checkPlayhqFixturesDue } from "../../../src/features/games/playhq-service.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { countingDb } from "../../helpers/counting-db.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

const games = async (deps: TestDeps) => (await listGamesWithVideoStatus(deps.db, deps.team.id)).map((r) => r.game).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
const sheet = (csv: string, competition = "VJBL") => {
	const body = new FormData();
	body.set("file", new File([csv], "fixture.csv", { type: "text/csv" }));
	body.set("competition", competition);
	return { method: "POST", body };
};
/** The hidden list of games on the check page, as the add form posts it. */
const addForm = (page: string, picks: number[]) => {
	const json = /name="games" value="([^"]*)"/.exec(page)?.[1]?.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&") ?? "";
	const body = new URLSearchParams({ games: json });
	for (const p of picks) body.append("pick", String(p));
	return { method: "POST", body };
};
afterEach(() => { vi.unstubAllGlobals(); });

describe("fixture from a spreadsheet", () => {
	it("reads Australian dates, 12- and 24-hour times, and No video", () => {
		expect(parseDate("31/10/2026")).toBe("2026-10-31");
		expect(parseDate("7-11-26")).toBe("2026-11-07");
		expect(parseDate("2026-11-07")).toBe("2026-11-07");
		expect(parseDate("Sat 7 Nov 2026")).toBe("2026-11-07");
		expect(parseDate("31 June 2027")).toBeNull();
		expect(parseDate("10/31/2026")).toBeNull();
		expect(parseTime("6:40pm")).toBe("18:40");
		expect(parseTime("9:00 AM")).toBe("09:00");
		expect(parseTime("12pm")).toBe("12:00");
		expect(parseTime("18:40:00")).toBe("18:40");
		expect(parseTime("6.40")).toBe("18:40");
		expect(parseTime("25:00")).toBeNull();
		const { games: read, problems } = readFixtureCsv(SAMPLE_CSV, "VJBL");
		expect(problems).toEqual([]);
		expect(read).toHaveLength(4);
		expect(read[0]).toEqual({ startsAt: "2026-10-31T18:40", competition: "VJBL", roundLabel: "5", opponent: "Lakeside Rockets", venue: "Saints Stadium, Court 2", noVideo: false, liveStream: true });
		expect(read[1]).toMatchObject({ startsAt: "2026-11-07T09:00", competition: "Tournament", noVideo: true });
		expect(read[3]).toMatchObject({ competition: "Practice match", roundLabel: "" });
	});
	it("says which rows it couldn't read, and needs a header row", () => {
		const { games: read, problems } = readFixtureCsv("Opponent;Date;Time\nLakeside;32/10/2026;6:40pm\nRiverton;1/11/2026;soon\n;2/11/2026;9am\n", "Tournament");
		expect(problems).toEqual(['Row 2: the date "32/10/2026" isn\'t one we can read (use 31/10/2026).', 'Row 3: the time "soon" isn\'t one we can read (use 6:40pm).']);
		expect(read).toEqual([{ startsAt: "2026-11-02T09:00", competition: "Tournament", roundLabel: "", opponent: "TBC", venue: "", noVideo: false, liveStream: true }]);
		expect(readFixtureCsv("Lakeside,31/10/2026\n", "VJBL").problems[0]).toMatch(/first row needs the column names/);
	});
	it("offers the sample to coaches, then shows the games to check, leaves out ones already there, and adds the ticked ones", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		const sample = await client("/fixture/sample.csv");
		expect(sample.headers.get("Content-Disposition")).toBe('attachment; filename="fixture-sample.csv"');
		expect(await sample.text()).toBe(SAMPLE_CSV);
		expect((await makeClient(deps, "stranger@x.com")("/fixture/sample.csv")).status).toBe(403);
		expect(await (await client("/fixture")).text()).toContain('<a href="/fixture/sample.csv" download>sample spreadsheet</a>');
		await client("/fixture", form({ date: "2026-10-31", hour: "6", minute: "40", period: "pm", competition: "VJBL", opponent: "Lakeside Rockets", video: "live" }));
		// Same day, same opponent, different time (6:30 by hand vs 6:40 in the sheet): still the same game.
		await client("/fixture", form({ date: "2026-11-14", hour: "10", minute: "0", period: "am", competition: "Practice match", opponent: "riverton wolves", video: "live" }));
		const page = await (await client("/fixture/sheet", sheet(SAMPLE_CSV))).text();
		expect(page).toContain("<h2>2 games to add</h2>");
		expect(page).toContain("<h2>Already in the fixture</h2>");
		expect(await (await client("/fixture/import", addForm(page, [0]))).headers.get("Location")).toBe("/fixture?done=imported");
		const after = await games(deps);
		expect(after.map((g) => [g.startsAt, g.opponent, g.noVideo])).toEqual([
			["2026-10-31T18:40", "Lakeside Rockets", false], ["2026-11-07T09:00", "Pine Valley Eagles", true], ["2026-11-14T10:00", "riverton wolves", false],
		]);
		// Adding the same list again adds nothing.
		expect((await client("/fixture/import", addForm(page, [0]))).headers.get("Location")).toBe("/fixture?done=importnone");
	});
	it("adds 100 games at once in a few database trips, each statement inside D1's limits", async () => {
		const deps = createTestDeps();
		const rows = Array.from({ length: 100 }, (_, i) => `${new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10)},6:40pm,Team ${i}`);
		const page = await (await makeClient(deps)("/fixture/sheet", sheet(`Date,Time,Opponent\n${rows.join("\n")}\n`))).text();
		const { db, counter } = countingDb(deps.db);
		expect((await makeClient({ ...deps, db })("/fixture/import", addForm(page, Array.from({ length: 100 }, (_, i) => i)))).headers.get("Location")).toBe("/fixture?done=imported");
		expect(await games(deps)).toHaveLength(100);
		expect(counter.trips).toBeLessThan(10);
		expect(counter.mostParams).toBeLessThanOrEqual(100);
	});
	it("turns away an Excel file, with how to save it as CSV", async () => {
		const res = await makeClient(createTestDeps())("/fixture/sheet", sheet("PK\u0003\u0004 binary"));
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("Save it as CSV first");
	});
	it("turns away a huge file before reading it", async () => {
		const res = await makeClient(createTestDeps())("/fixture/sheet", { ...sheet(SAMPLE_CSV), headers: { "Content-Length": "5000000" } });
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("too big for a fixture");
	});
	it("needs the competition, rather than guessing VJBL", async () => {
		const res = await makeClient(createTestDeps())("/fixture/sheet", sheet(SAMPLE_CSV, "Rugby"));
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("Choose the competition");
	});
});

describe("fixture from any link (AI)", () => {
	const page = "<html><head><title>x</title></head><body><table><tr><td>Sat 7 Nov</td><td>9:00 AM</td><td>Saints</td><td>Eagles</td></tr></table><p>More words so the page has some text to read through.</p></body></html>";
	it("reads the page's text, table cells apart", () => {
		expect(pageText(page)).toBe("Sat 7 Nov | 9:00 AM | Saints | Eagles |\nMore words so the page has some text to read through.");
	});
	it("leaves out a character reference past the last character there is, rather than failing the page", () => {
		expect(pageText("<p>Round&#32;4 &#99999999; vs Eagles&#33;</p>")).toBe("Round 4 vs Eagles!");
	});
	it("shows the games the AI read to check, with problems for anything unclear", async () => {
		const deps = createTestDeps();
		vi.stubGlobal("fetch", async () => new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
		deps.ai.json = { games: [
			{ date: "2026-11-07", time: "09:00", round: "Round 1", opponent: "Pine Valley Eagles", venue: "Glenview Ct 3" },
			{ date: "2026-11-08", time: "", round: "Semi Final", opponent: "", venue: "" },
			{ date: "Sunday", time: "10:00", round: "", opponent: "Lakeside", venue: "" },
		] };
		const client = makeClient(deps);
		const res = await client("/fixture/link", form({ url: "https://tournament.example/u12", competition: "Tournament", noVideo: "1" }));
		const html = await res.text();
		// The team's name comes from its code (b12.1), never typed.
		expect(deps.ai.read[0]).toContain('Our team: Saints U12 Boys 1 (it may be written "Saints U12 Boys 1" or "Saints U12B1", or just "Saints 1" on a page for U12 Boys alone)\nPage: https://tournament.example/u12\n\nSat 7 Nov | 9:00 AM');
		expect(html).toContain("<h2>2 games to add</h2>");
		expect(html).toContain("No tip-off time for 2026-11-08: set to 6:40pm, edit it after adding.");
		expect(html).toContain("Left out a game with no clear date (vs Lakeside).");
		await client("/fixture/import", addForm(html, [0, 1]));
		expect((await games(deps)).map((g) => [g.startsAt, g.competition, g.roundLabel, g.opponent, g.noVideo])).toEqual([
			["2026-11-07T09:00", "Tournament", "Round 1", "Pine Valley Eagles", true], ["2026-11-08T18:40", "Tournament", "Semi Final", "TBC", true],
		]);
	});
	it("gives a game the page has no time for the team's own usual tip-off: 7:40pm for a U14 team", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		vi.stubGlobal("fetch", async () => new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
		deps.ai.json = { games: [{ date: "2026-11-08", time: "", round: "Semi Final", opponent: "", venue: "" }] };
		const html = await (await makeClient(deps, { email: "jane@x.com", team: G14_5.id })("/fixture/link", form({ url: "https://tournament.example/u14", competition: "Tournament" }))).text();
		expect(html).toContain("No tip-off time for 2026-11-08: set to 7:40pm, edit it after adding.");
		expect(html).toContain("2026-11-08T19:40");
	});
	it("reads over HTTPS only: an http link is asked for securely, and redirects are followed only to https pages", async () => {
		const deps = createTestDeps();
		const asked: string[] = [];
		vi.stubGlobal("fetch", async (url: URL) => {
			asked.push(String(url));
			if (url.pathname === "/old") return new Response(null, { status: 301, headers: { Location: "/u12" } });
			if (url.pathname === "/away") return new Response(null, { status: 302, headers: { Location: "http://plain.example/x" } });
			return new Response(page, { headers: { "Content-Type": "text/html" } });
		});
		deps.ai.json = { games: [] };
		const link = (url: string) => makeClient(deps)("/fixture/link", form({ url, competition: "VJBL" }));
		expect((await link("http://club.example/old")).status).toBe(200);
		expect(asked).toEqual(["https://club.example/old", "https://club.example/u12"]);
		expect(await (await link("https://club.example/away")).text()).toContain("Couldn&#39;t open that page");
	});
	it("says so when the page can't be opened or has nothing to read", async () => {
		const deps = createTestDeps();
		vi.stubGlobal("fetch", async () => new Response("nope", { status: 404 }));
		const link = (url: string) => makeClient(deps)("/fixture/link", form({ url, competition: "VJBL" }));
		expect(await (await link("https://club.example/fixture")).text()).toContain("(it said 404)");
		vi.stubGlobal("fetch", async () => new Response("<div id=app></div>", { headers: { "Content-Type": "text/html" } }));
		expect(await (await link("https://club.example/fixture")).text()).toContain("Some sites only show their fixture after the page loads");
		expect(deps.ai.read).toEqual([]);
	});
	it("sends PlayHQ team links to the PlayHQ import, marked No video when ticked", async () => {
		const deps = createTestDeps();
		deps.playhq.teams.set("8fab8b8c", { name: "Saints U12 Boys 1", games: [{ id: "g1", round: "Round 1", date: "2026-11-07", time: "09:00", opponent: "Lakeside", venue: "" }] });
		const url = "https://www.playhq.com/example-association/org/x/y/teams/saints-b12\.1-2026-1/8fab8b8c";
		const res = await makeClient(deps)("/fixture/link", form({ url, competition: "Tournament", noVideo: "1" }));
		expect(res.headers.get("Location")).toBe("/fixture?done=playhqadded");
		expect((await games(deps)).map((g) => [g.opponent, g.noVideo])).toEqual([["Lakeside", true]]);
		// PlayHQ adds a final during the tournament: it comes in marked No video too.
		deps.playhq.teams.set("8fab8b8c", { name: "Saints U12 Boys 1", games: [
			{ id: "g1", round: "Round 1", date: "2026-11-07", time: "09:00", opponent: "Lakeside", venue: "" },
			{ id: "g2", round: "Final", date: "2026-11-08", time: "15:00", opponent: "Riverton", venue: "" },
		] });
		await checkPlayhqFixturesDue({ ...deps, now: () => new Date(deps.now().getTime() + 9 * 3_600_000) });
		expect((await games(deps)).map((g) => [g.opponent, g.noVideo])).toEqual([["Lakeside", true], ["Riverton", true]]);
		expect(await (await makeClient(deps)("/fixture")).text()).toContain('<span class="t src">No video</span>');
	});
	it("refuses a private PlayHQ link (My teams) with which link to use instead, and adds nothing", async () => {
		const deps = createTestDeps();
		deps.playhq.teams.set("8fab8b8c", { name: "Saints U12 Boys 1", games: [{ id: "g1", round: "Round 1", date: "2026-11-07", time: "09:00", opponent: "Lakeside", venue: "" }] });
		const res = await makeClient(deps)("/fixture/link", form({ url: "https://www.playhq.com/account/my-teams/example-association/saints-b12\.1-2026-1/8fab8b8c?id=5f4a9c79-3ec5-48e6-b0e6-74f5eb6dcb67", competition: "VJBL" }));
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("That&#39;s a private PlayHQ link (from My teams, when you&#39;re signed in to PlayHQ)");
		expect(await games(deps)).toEqual([]);
		expect(await listPlayhqFixtures(deps.db, deps.team.id)).toEqual([]);
	});
	it("Add fixture says a PlayHQ link must be the team's public page, not My teams", async () => {
		const page = await (await makeClient(createTestDeps())("/fixture")).text();
		expect(page).toContain("<b>any public fixture page</b>, like a tournament's draw (AI reads out <b>Saints U12 Boys 1</b>'s games, and you check them before they're added).");
		expect(page, "no team name to type: it comes from the code").not.toContain('name="team"');
		expect(page).toContain("For PlayHQ, use the team's <b>public</b> page: find the team on playhq.com without signing in and copy its address (it has <b>/org/</b> and <b>/teams/</b> in it). The <b>My teams</b> link you see when signed in is private, so the site can't read it.");
	});
	it("No video is per fixture: this tournament no filming, next year's allowed, and either can be switched", async () => {
		const deps = createTestDeps();
		const link = (id: string) => `https://www.playhq.com/example-association/org/x/y/teams/saints-b12\.1-2026-1/${id}`;
		deps.playhq.teams.set("aaaa1111", { name: "Tournament 2026", games: [{ id: "t1", round: "Round 1", date: "2026-11-07", time: "09:00", opponent: "Lakeside", venue: "" }] });
		deps.playhq.teams.set("bbbb2222", { name: "Tournament 2027", games: [{ id: "u1", round: "Round 1", date: "2027-11-06", time: "09:00", opponent: "Riverton", venue: "" }] });
		const client = makeClient(deps);
		await client("/fixture/link", form({ url: link("aaaa1111"), competition: "Tournament", noVideo: "1" }));
		await client("/fixture/link", form({ url: link("bbbb2222"), competition: "Tournament" }));
		const state = async () => (await games(deps)).map((g) => [g.opponent, g.noVideo]);
		expect(await state()).toEqual([["Lakeside", true], ["Riverton", false]]);
		const page = await (await client("/fixture")).text();
		expect(page).toContain("allowed, so its games (and any added later) aren&#39;t offered for upload or Go live.");
		expect(page).toContain("Video allowed.");
		// Change of heart either way: the games follow, and so will any the fixture adds later.
		const [first, second] = (await deps.db.prepare("SELECT id FROM playhq_fixtures ORDER BY id").all<{ id: number }>()).results;
		await client(`/fixture/playhq/${first!.id}/video`, form({}));
		await client(`/fixture/playhq/${second!.id}/no-video`, form({}));
		expect(await state()).toEqual([["Lakeside", false], ["Riverton", true]]);
		expect((await makeClient(createTestDeps(), "stranger@x.com")(`/fixture/playhq/${first!.id}/video`, form({}))).status).toBe(403);
	});
	it("a fixture switched to No video closes a Go live opened but unused on its games, and is refused while one is streaming", async () => {
		const deps = createTestDeps();
		deps.playhq.teams.set("aaaa1111", { name: "Tournament 2026", games: [
			{ id: "t1", round: "Round 1", date: "2026-11-07", time: "09:00", opponent: "Lakeside", venue: "" },
			{ id: "t2", round: "Round 2", date: "2026-11-07", time: "11:00", opponent: "Riverton", venue: "" }] });
		const client = makeClient(deps);
		await client("/fixture/link", form({ url: "https://www.playhq.com/example-association/org/x/y/teams/saints-b12.1-2026-1/aaaa1111", competition: "Tournament" }));
		const [lakeside, riverton] = (await games(deps)).map((g) => g.id);
		const fixtureId = (await deps.db.prepare("SELECT id FROM playhq_fixtures").first<{ id: number }>())!.id;
		const stream = (gameId: number, uid: string, source: string) => deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at, source) VALUES (?, ?, ?, 1, ?, ?)")
			.bind(deps.team.id, gameId, uid, "2026-10-15T00:00:00.000Z", source).run();
		const status = async () => (await deps.db.prepare("SELECT live_input_uid AS uid, status FROM live_streams ORDER BY id").all<{ uid: string; status: string }>()).results;
		for (const uid of ["in-lakeside", "in-riverton"]) deps.live.inputs.set(uid, { name: uid, enabled: true });
		await stream(lakeside!, "in-lakeside", "camera");
		await stream(riverton!, "in-riverton", "app");
		deps.live.appConnectedTo.add("in-riverton");
		const refused = await client(`/fixture/playhq/${fixtureId}/no-video`, form({}));
		expect(refused.status).toBe(409);
		expect((await games(deps)).map((g) => g.noVideo)).toEqual([false, false]);
		expect(await status()).toEqual([{ uid: "in-lakeside", status: "cancelled" }, { uid: "in-riverton", status: "open" }]);
		deps.live.appConnectedTo.clear();
		expect((await client(`/fixture/playhq/${fixtureId}/no-video`, form({}))).status).toBe(303);
		expect((await games(deps)).map((g) => g.noVideo)).toEqual([true, true]);
		expect(await status()).toEqual([{ uid: "in-lakeside", status: "cancelled" }, { uid: "in-riverton", status: "cancelled" }]);
	});
});
