// Staging (docs/runbooks/staging.md): a Worker Preview with its own database and bucket, for trying a change on real
// phones before it goes live. It must never be mistaken for the live site, and its jobs only run when asked.
import { describe, expect, it, vi } from "vitest";
import { form, makeClient } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { seedGame, seedVideo } from "../helpers/seed.ts";

const staging = (deps: TestDeps): TestDeps => ({ ...deps, config: { ...deps.config, staging: true } });
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
});
