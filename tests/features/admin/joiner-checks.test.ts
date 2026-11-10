import { describe, expect, it } from "vitest";
import { checkJoiner } from "../../../src/features/admin/joiner-checks.ts";
import { runDaily } from "../../../src/jobs/daily.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

const alert = (deps: TestDeps) => deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'joiner'").first<{ level: string; detail: string }>();

describe("the joiner's nightly check", () => {
	it("joins the two test files and records ok with how long it took", async () => {
		const deps = createTestDeps();
		await checkJoiner(deps);
		expect(deps.joiner.selfTests).toBe(1);
		expect(await alert(deps)).toEqual({ level: "ok", detail: "Joined the test files in 12 seconds" });
	});
	it("a joiner that fails or doesn't answer is a warning; an urgent alert (a game stuck) is left for Keep the first part to clear", async () => {
		const deps = createTestDeps();
		deps.joiner.down = true;
		await checkJoiner(deps);
		expect(await alert(deps)).toMatchObject({ level: "warn", detail: expect.stringContaining("didn't answer") });
		deps.joiner.down = false;
		deps.joiner.result = { ok: false, reason: "ffmpeg not found" };
		await checkJoiner(deps);
		expect(await alert(deps)).toMatchObject({ level: "warn", detail: expect.stringContaining("ffmpeg not found") });
		await deps.db.prepare("UPDATE platform_alerts SET level = 'urgent' WHERE kind = 'joiner'").run();
		deps.joiner.result = { ok: true, bytes: 10, seconds: 1 };
		await checkJoiner(deps);
		expect((await alert(deps))?.level).toBe("urgent");
	});
	it("without a joiner (cf dev) it records that there's none, and never fails the night", async () => {
		const deps = createTestDeps();
		(deps as { joiner: unknown }).joiner = null;
		await runDaily(deps);
		expect(await alert(deps)).toMatchObject({ level: "warn", detail: "No joiner is bound to this Worker" });
	});
});
