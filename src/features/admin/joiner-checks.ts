// The joiner, once a night: it joins two tiny files shipped in its image, so a broken joiner is known before a game
// needs it. Ok says how long it took; a warning says why not. An urgent alert (a game's join gave up, live/join-service.ts)
// is left alone: Keep the first part clears it. Never fails the night.
import type { AppDeps } from "../../app/deps.ts";
import { getAlert } from "./alerts-repository.ts";
import { setAlert } from "./alerts-service.ts";
import { alertFailed } from "./problem-log.ts";

export async function checkJoiner(deps: AppDeps): Promise<void> {
	try {
		const was = (await getAlert(deps.db, "joiner"))?.level ?? "ok";
		if (!deps.joiner) return void (await setAlert(deps, "joiner", "warn", "No joiner is bound to this Worker"));
		const answer = await deps.joiner.selfTest().catch((err: unknown) => ({ ok: false as const, reason: `the joiner didn't answer: ${err instanceof Error ? err.message : String(err)}` }));
		if (was === "urgent") return;
		if (answer.ok) await setAlert(deps, "joiner", "ok", `Joined the test files in ${answer.seconds} seconds`);
		else await setAlert(deps, "joiner", "warn", answer.reason.slice(0, 300));
	} catch (err) {
		await alertFailed(deps, "joiner", err);
	}
}
