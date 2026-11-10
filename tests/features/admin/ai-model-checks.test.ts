import { describe, expect, it } from "vitest";
import { checkAiModels } from "../../../src/features/admin/ai-model-checks.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

// The Workers AI model the site uses, checked against Cloudflare's catalog: a planned retirement warns, two weeks before
// it (or a model gone from the catalog) is urgent, with a ticket saying what to do; Platform checks it as it opens.

const alert = async (deps: ReturnType<typeof createTestDeps>) =>
	deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'ai_models'").first<{ level: string; detail: string }>();

describe("the AI models alert", () => {
	it("is fine while the model is current", async () => {
		const deps = createTestDeps(new Date("2026-10-20T00:00:00Z"));
		await checkAiModels(deps);
		expect(await alert(deps)).toEqual({ level: "ok", detail: "The model is current" });
	});
	it("warns once a model has a retirement date, and is urgent two weeks before it, naming the model, what uses it and the day", async () => {
		const deps = createTestDeps(new Date("2026-10-20T00:00:00Z"));
		deps.ai.models[0]!.retiresOn = "2026-11-15";
		await checkAiModels(deps);
		expect(await alert(deps)).toEqual({ level: "warn", detail: "The model for Ask Virtual Team Manager, the Documentation assistant and reading fixture pages, @cf/google/gemma-4-26b-a4b-it, is to be retired on Sun 15 Nov 2026" });
		const ticket = await deps.db.prepare("SELECT title, message FROM support_requests WHERE alert_kind = 'ai_models'").first<{ title: string; message: string }>();
		expect(ticket?.title).toBe("An AI model is to be retired");
		expect(ticket?.message).toContain("change MODEL in src/platform/workers-ai.ts (the one model, for staging and the live site alike)");
		(deps as { now: () => Date }).now = () => new Date("2026-11-01T00:00:00Z");
		await checkAiModels(deps);
		expect((await alert(deps))?.level).toBe("urgent");
	});
	it("is urgent once a model has gone from the catalog", async () => {
		const deps = createTestDeps(new Date("2026-10-20T00:00:00Z"));
		deps.ai.models[0]!.listed = false;
		await checkAiModels(deps);
		expect(await alert(deps)).toEqual({ level: "urgent", detail: "The model for Ask Virtual Team Manager, the Documentation assistant and reading fixture pages, @cf/google/gemma-4-26b-a4b-it, isn't in Cloudflare's catalog any more" });
	});
	it("Platform checks it as it opens, and shows it; a catalog that doesn't answer leaves the page as it is", async () => {
		const deps = createTestDeps(new Date("2026-11-06T00:00:00Z"));
		deps.ai.models[0]!.retiresOn = "2026-11-15";
		const page = await (await makeClient(deps)("/admin/platform")).text();
		expect(page).toMatch(/AI models \(Workers AI\)[^]*?is to be retired on Sun 15 Nov 2026/);
		expect((await alert(deps))?.level).toBe("urgent");
		deps.ai.down = true;
		expect((await makeClient(deps)("/admin/platform")).status).toBe(200);
	});
});
