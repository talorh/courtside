import { describe, expect, it } from "vitest";
import { deleteVideo } from "../../../src/features/videos/video-removal-service.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { aDayLater } from "../../helpers/purge.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

describe("deleteVideo", () => {
	it("a person's delete: off the site at once, the Stream copy and original kept a day in case of a mistake", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1", r2Key: "originals/a.mov" });
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, id))!, "admin");
		expect(await getVideo(deps.db, deps.team.id, id)).toBeNull();
		expect(deps.stream.deleted).toEqual([]);
		expect(deps.originals.removed).toEqual([]);
		expect((await aDayLater(deps)).purged).toBe(1);
		expect(deps.stream.deleted).toEqual(["u1"]);
		expect(deps.originals.removed).toEqual(["originals/a.mov"]);
		expect((await aDayLater(deps)).purged).toBe(0);
	});
	it("an automatic delete (end of season) removes the media straight away", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1", r2Key: "originals/a.mov" });
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, id))!, "retention");
		expect(deps.stream.deleted).toEqual(["u1"]);
		expect(deps.originals.removed).toEqual(["originals/a.mov"]);
	});
	it("aborts an unfinished multipart upload instead of deleting an object", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), status: "uploading", r2Key: "originals/b.mov", r2UploadId: "up-1" });
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, id))!, "upload_cancelled");
		expect(deps.originals.aborted).toEqual(["originals/b.mov"]);
		expect(deps.originals.removed).toEqual([]);
	});
});
