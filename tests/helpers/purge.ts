import type { TeamDeps } from "../../src/app/deps.ts";
import { enforceRetention } from "../../src/features/videos/retention-service.ts";

/** Moves the test clock on 25 hours and runs the clean-up: media of a video a person deleted goes a day later. */
export async function aDayLater(deps: TeamDeps) {
	const later = new Date(deps.now().getTime() + 25 * 3600_000);
	(deps as { now: () => Date }).now = () => later;
	return enforceRetention(deps);
}
