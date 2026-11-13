import { describe, expect, it } from "vitest";
import { insertLiveVideoWrite, markUploaded } from "../../../src/features/videos/video-writes-repository.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

describe("when a video's processing began", () => {
	it("is written as an upload finishes, whenever the video's row was made", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), status: "uploading", r2Key: "k", r2UploadId: "u", createdAt: "2026-10-14T09:00:00.000Z" });
		await markUploaded(deps.db, deps.team.id, id, "2026-10-15T00:00:00.000Z");
		expect(await getVideo(deps.db, deps.team.id, id)).toMatchObject({ status: "processing", processingAt: "2026-10-15T00:00:00.000Z" });
	});
	it("is when an external app's recording is first seen, as that starts at processing", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		await insertLiveVideoWrite(deps.db, { teamId: deps.team.id, gameId, streamUid: "app-1", uploadedBy: null, deleteAfter: "2027-12-31T13:00:00.000Z", createdAt: "2026-10-15T00:00:00.000Z" }).run();
		const { results } = await deps.db.prepare("SELECT processing_at FROM videos WHERE team_id = ? AND game_id = ?").bind(deps.team.id, gameId).all();
		expect(results).toEqual([{ processing_at: "2026-10-15T00:00:00.000Z" }]);
	});
});
