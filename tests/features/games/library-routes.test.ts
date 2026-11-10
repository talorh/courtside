import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

describe("games list", () => {
	it("lists every game oldest first; games without footage show the court and what they're waiting for", async () => {
		const deps = createTestDeps();
		const lakeside = await seedGame(deps);
		const nuna = await seedGame(deps, { startsAt: "2026-10-04T10:20", roundLabel: "8", opponent: "Westside Storm" });
		const proc = await seedGame(deps, { startsAt: "2026-10-12T10:00", roundLabel: "P", opponent: "Still Processing" });
		await seedGame(deps, { startsAt: "2026-10-25T10:20", roundLabel: "10", opponent: "Upcoming Team" });
		await seedVideo(deps, { gameId: lakeside, streamUid: "a" });
		await seedVideo(deps, { gameId: nuna, streamUid: "b" });
		await seedVideo(deps, { gameId: proc, status: "processing", streamUid: "c" });
		const client = makeClient(deps);
		const page = await (await client("/games")).text();
		expect(page.indexOf("Westside")).toBeLessThan(page.indexOf("Lakeside Rockets"));
		expect(page.indexOf("Lakeside Rockets")).toBeLessThan(page.indexOf("Upcoming Team"));
		// Each kind of game looks different: ready, processing (with "ready soon"), upcoming.
		expect(page).toContain(`<a class="game s-ready" href="/games/${lakeside}">`);
		expect(page).toContain('<span class="gstate"><i aria-hidden="true"></i>Ready to watch</span>');
		expect(page).toContain(`<a class="game s-processing" href="/games/${proc}">`);
		expect(page).toContain('<i aria-hidden="true"></i>Processing</span><span class="soon">Ready to watch soon</span>');
		expect(page).toMatch(/<a class="game s-upcoming" href="\/games\/\d+"><div class="thumb court"><img src="\/court.webp" alt="" loading="lazy"><\/div>/);
		expect(page).toContain('<i aria-hidden="true"></i>Upcoming</span>');
		await seedGame(deps, { startsAt: "2026-10-01T10:00", roundLabel: "7", opponent: "Not Uploaded" });
		expect(await (await client("/games")).text()).toContain('<i aria-hidden="true"></i>Waiting for video</span>');
		expect(page).toContain(`href="/games/${lakeside}"`);
		expect(page).toContain("47:10");
		expect(page).toContain('<div class="when">Sun 11 Oct 2026<span class="clock">11:40am</span></div>');
		expect(page).toContain('<span class="t src">VJBL</span>');
		expect(page).not.toContain('type="search"');
	});

	it("shows a frame from each game as its thumbnail", async () => {
		const deps = createTestDeps();
		await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "a" });
		const page = await (await makeClient(deps)("/games")).text();
		// 2830 s long, so a quarter of the way in is 708 s.
		expect(page).toContain('<div class="thumb has-img"><img src="https://customer-cust.cloudflarestream.com/tok-a/thumbnails/thumbnail.jpg?time=708s&amp;height=360" alt="" loading="lazy">');
	});

	it("keeps itself up to date (Processing turns into Ready to watch without a reload)", async () => {
		const page = await (await makeClient(createTestDeps())("/games")).text();
		expect(page).toContain('<script type="module" src="/games-refresh.js"></script>');
	});

	it("filters by competition", async () => {
		const deps = createTestDeps();
		await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "a" });
		await seedVideo(deps, { gameId: await seedGame(deps, { competition: "Tournament", roundLabel: "Semi", opponent: "Box Hill" }), streamUid: "b" });
		const client = makeClient(deps);
		const all = await (await client("/games")).text();
		expect(all).toContain('<a class="chip" href="/games" aria-current="true">All</a><a class="chip" href="/games?c=VJBL" aria-current="false">VJBL</a><a class="chip" href="/games?c=Tournament" aria-current="false">Tournament</a>');
		expect(all).not.toContain("Practice match</a>");
		const tour = await (await client("/games?c=Tournament")).text();
		expect(tour).toContain("Box Hill");
		expect(tour).not.toContain("Lakeside Rockets");
		expect(tour).toContain('<a class="chip" href="/games?c=Tournament" aria-current="true">Tournament</a>');
		const practice = await (await client("/games?c=Practice%20match")).text();
		expect(practice).toContain("No games in this competition yet.");
		const bogus = await (await client("/games?c=Rugby")).text();
		expect(bogus).toContain("Lakeside Rockets");
		expect(bogus).toContain("Box Hill");
	});

	it("has no filter when there are no games yet", async () => {
		const page = await (await makeClient(createTestDeps())("/games")).text();
		expect(page).not.toContain('class="chip"');
		expect(page).toContain("No games yet.");
	});
	it("names the team's own season: each team is one season's squad, and next season is a new team", async () => {
		expect(await (await makeClient(createTestDeps())("/games")).text()).toContain("Season 2026/27</div>");
		const later = await (await makeClient(createTestDeps(new Date("2027-10-02T00:00:00Z")))("/games")).text();
		expect(later).toContain("Season 2026/27</div>");
	});
});
