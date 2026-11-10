import { logProblem } from "../admin/problem-log.ts";
import type { TeamDeps } from "../../app/deps.ts";
import type { PhotoVariant } from "../../platform/hosted-images.ts";

/**
 * Signed links to these photos' images, by photo id. Null when Images can't sign them just now: logged, and the page
 * still opens, saying the photos can't be shown (Photos, a photo's page, Manage team's removal requests).
 */
export async function photoLinks(deps: TeamDeps, photos: Array<{ id: number; imageId: string }>, variant: PhotoVariant): Promise<Map<number, string> | null> {
	try {
		return new Map(await Promise.all(photos.map(async (p) => [p.id, await deps.images.url(p.imageId, variant)] as const)));
	} catch (err) {
		console.error(JSON.stringify({ event: "photo_links_failed", teamId: deps.team.id, variant, error: String(err) }));
		await logProblem(deps, { kind: "photo_problem", teamId: deps.team.id, what: "Images couldn't make links to the team's photos, so they couldn't be shown", error: err });
		return null;
	}
}
