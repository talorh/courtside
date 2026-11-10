// The Workers AI model the site uses (platform/workers-ai.ts: one, for staging and the live site alike), checked against Cloudflare's catalog every night and
// whenever Platform opens: a model with a planned retirement warns, and is urgent from two weeks before the day (or once
// it's gone from the catalog), so there's time to pick another and try it on staging.
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { addDays, formatDay, localDate } from "../../shared/time.ts";
import { setAlert } from "./alerts-service.ts";

/** From this many days before a model's retirement, the alert is urgent. */
export const URGENT_DAYS = 14;
/** How long Platform waits for the catalog before showing the page without a fresh check. */
const PLATFORM_WAIT_MS = 3000;

export async function checkAiModels(deps: AppDeps): Promise<void> {
	const models = await deps.ai.retirements();
	const soon = localDate(addDays(deps.now(), URGENT_DAYS));
	const gone = models.filter((m) => !m.listed), retiring = models.filter((m) => m.listed && m.retiresOn !== null);
	const level = gone.length > 0 || retiring.some((m) => m.retiresOn! <= soon) ? "urgent" : retiring.length > 0 ? "warn" : "ok";
	const detail = [
		...gone.map((m) => `The model for ${m.use}, ${m.model}, isn't in Cloudflare's catalog any more`),
		...retiring.map((m) => `The model for ${m.use}, ${m.model}, is to be retired on ${formatDay(m.retiresOn!)}`),
	].join("; ");
	await setAlert(deps, "ai_models", level, detail || (models.length === 1 ? "The model is current" : `All ${models.length} models are current`));
}

/** Platform's own check as it opens: one that's slow or fails is logged, and the page shows the last one. */
export async function checkAiModelsSoon(deps: AppDeps): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<void>((resolve) => { timer = setTimeout(resolve, PLATFORM_WAIT_MS); });
	try {
		await Promise.race([checkAiModels(deps), late]);
	} catch (err) {
		console.error(JSON.stringify({ event: "ai_models_check_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "Workers AI's models couldn't be checked for retirements", error: err });
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
