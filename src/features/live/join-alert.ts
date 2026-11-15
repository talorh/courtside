import type { AppDeps } from "../../app/deps.ts";
import { setAlert } from "../admin/alerts-service.ts";
import { anyJoinGivenUp } from "./join-waiting-repository.ts";

/** A game whose join gave up was dealt with (Keep the first part, or its video deleted). The joiner's alert is one for
 * the whole site, raised by any team's game, so it clears only once no team's game is still waiting. */
export async function joinDealtWith(deps: AppDeps, detail: string): Promise<void> {
	if (await anyJoinGivenUp(deps.db)) return;
	await setAlert(deps, "joiner", "ok", detail);
}
