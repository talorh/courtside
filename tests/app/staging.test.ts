// Staging (docs/runbooks/staging.md): a Worker Preview with its own database and bucket, for trying a change on real
// phones before it goes live. It must never be mistaken for the live site, and its jobs only run when asked.
import { describe, expect, it, vi } from "vitest";
import { form, makeClient } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { seedGame, seedVideo } from "../helpers/seed.ts";
import type { Game } from "../../src/features/games/games-repository.ts";
import { matchMessage } from "../../src/features/roster/match-message.ts";

const staging = (deps: TestDeps): TestDeps => ({ ...deps, config: { ...deps.config, staging: true, siteHost: "staging-courtside.saints-club.workers.dev" } });
const STAGING_SITE = "https://staging-courtside.saints-club.workers.dev";
const GAME: Game = {
	id: 1, teamId: "t", startsAt: "2026-10-23T18:30", competition: "Practice match", roundLabel: "", opponent: "Riverton", venue: "Saints Stadium, Court 1",
	noVideo: false, playhqGone: false, fromPlayhq: false, phase: null, liveStream: true,
};
const STRIP = '<div class="stagingstrip" role="note"><b>Staging:</b> test data, not the live site.</div>';

describe("staging", () => {
	it("says so at the top of every page, and the live site never does", async () => {
		const deps = createTestDeps();
		for (const path of ["/", "/games", "/admin", "/no-such-page"]) {
			expect(await (await makeClient(staging(deps))(path)).text(), path).toContain(STRIP);
			expect(await (await makeClient(deps)(path)).text(), path).not.toContain("stagingstrip");
		}
	});

	it("says so in its emails' subjects", async () => {
		const deps = createTestDeps();
		await makeClient(staging(deps))("/admin/test-email", form({}));
		await makeClient(deps)("/admin/test-email", form({}));
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["[Staging] Courtside: test email", "Courtside: test email"]);
	});

	it("runs the 5-minute job when an admin taps Run the 5-minute job now, as staging has no scheduled jobs; the live site has no such button", async () => {
		const deps = createTestDeps();
		const videoId = await seedVideo(deps, { gameId: await seedGame(deps), status: "processing", streamUid: "u1" });
		deps.stream.videos.set("u1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2400 });
		vi.spyOn(console, "log").mockImplementation(() => {});
		expect(await (await makeClient(deps)("/admin/platform")).text()).not.toContain("/admin/run-sync");
		expect((await makeClient(deps)("/admin/run-sync", form({}))).status).toBe(404);
		expect(await (await makeClient(staging(deps))("/admin/platform")).text()).toContain('<form method="post" action="/admin/run-sync" class="inline"><button class="btn">Run the 5-minute job now</button></form>');
		const ran = await makeClient(staging(deps))("/admin/run-sync", form({}));
		expect(ran.headers.get("Location")).toBe("/admin/platform?done=ran");
		expect(await deps.db.prepare("SELECT status FROM videos WHERE id = ?").bind(videoId).first("status")).toBe("ready");
		expect(await (await makeClient(staging(deps))("/admin/platform?done=ran")).text()).toContain("The 5-minute job ran.");
	});

	it("links its emails to its own address, never the live site's", async () => {
		const deps = createTestDeps();
		const site = staging(deps);
		await makeClient(site)("/admin/test-email", form({}));
		await makeClient(site)("/admin/admins", form({ email: "jane@example.com", again: "jane@example.com" }));
		await makeClient(site)("/support", form({ topic: "videos", message: "An upload stops at 80%.", contact: "0400 000 000" }));
		const texts = deps.email.sent.map((e) => e.text);
		expect(texts).toHaveLength(3);
		expect(texts[0]).toContain(`Platform: ${STAGING_SITE}/admin/platform`);
		expect(texts[1]).toContain(`Admins: ${STAGING_SITE}/admin/admins`);
		expect(texts[2]).toContain(`${STAGING_SITE}/admin/support/1`);
		expect(texts.join("\n")).not.toContain("https://saints.example");
	});

	it("tells the family on video to film from its own address in the match day message", () => {
		const text = matchMessage({ site: STAGING_SITE, game: { ...GAME, liveStream: true }, slots: [{ week: "2026-10-19", duty: "video", position: 1, gameId: 1, familyId: 8 }],
			names: new Map([[8, "Curry"]]), video: true, uniform: "Navy" });
		expect(text).toContain(`🎥 Video: Curry (live stream it from ${STAGING_SITE})`);
	});
});
