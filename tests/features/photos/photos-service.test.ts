import { describe, expect, it, vi } from "vitest";
import { getActiveMember } from "../../../src/features/members/members-repository.ts";
import { getPhoto, listPhotos } from "../../../src/features/photos/photos-repository.ts";
import { addPhoto, deletePhoto, enforcePhotoRetention } from "../../../src/features/photos/photos-service.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { hasExif, testJpeg } from "../../helpers/jpeg.ts";

// Saturday 24 Oct 2026, 7pm in the club's time zone.
const NOW = new Date("2026-10-24T08:00:00Z");

async function setup(now = NOW) {
	const deps = createTestDeps(now);
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'f@x.com', 'Fran Filmer', 'filmer')").bind(deps.team.id).run();
	return { deps, filmer: (await getActiveMember(deps.db, deps.team.id, 2))! };
}

const row = (deps: ReturnType<typeof createTestDeps>, id: number) =>
	deps.db.prepare("SELECT image_id, taken_at, width, height, bytes, uploaded_by, delete_after, deleted_at, deleted_reason FROM photos WHERE id = ?").bind(id).first();

describe("adding a photo", () => {
	it("keeps the photo in Images with the location taken out, and a row with when it was taken, its size and when it goes", async () => {
		const { deps, filmer } = await setup();
		const id = await addPhoto(deps, filmer, testJpeg({ width: 2560, height: 1920, exif: true }), "2026-10-23T19:05:12");
		const [image] = [...deps.images.stored.values()];
		expect(hasExif(image!.bytes)).toBe(false);
		expect(image).toMatchObject({ teamId: "b12.1-2026", uploadedBy: 2, filename: "saints-b12-1-2026-10-23-photo-1.jpg" });
		expect(await row(deps, id)).toEqual({
			image_id: "img-1", taken_at: "2026-10-23T19:05:12", width: 2560, height: 1920, bytes: image!.bytes.length, uploaded_by: 2,
			delete_after: "2027-12-31T13:00:00.000Z", deleted_at: null, deleted_reason: null,
		});
	});
	it("with no date from the phone, one still to come, or one that isn't a date, it's when the photo was added", async () => {
		const { deps, filmer } = await setup();
		for (const takenAt of ["", "2026-10-24T19:00:01", "0000-00-00T00:00:00", "2026-02-30T10:00:00", "2026-10-23T25:00:00", "yesterday"]) {
			expect(await row(deps, await addPhoto(deps, filmer, testJpeg(), takenAt))).toMatchObject({ taken_at: "2026-10-24T19:00:00" });
		}
	});
	it("goes with its team's season, whenever it was taken: September's before the season too", async () => {
		const { deps, filmer } = await setup();
		for (const takenAt of ["2026-09-12T10:00:00", "2025-03-01T10:00:00", "2026-10-23T19:05:12"]) {
			expect(await row(deps, await addPhoto(deps, filmer, testJpeg(), takenAt))).toMatchObject({ taken_at: takenAt, delete_after: "2027-12-31T13:00:00.000Z" });
		}
	});
	it("refuses what isn't a photo, and any photo once its team's photos are gone", async () => {
		const { deps, filmer } = await setup();
		await expect(addPhoto(deps, filmer, new TextEncoder().encode("<svg/>"), "")).rejects.toMatchObject({ status: 400 });
		const after = { ...deps, now: () => new Date("2028-01-02T00:00:00Z") };
		await expect(addPhoto(after, filmer, testJpeg(), "")).rejects
			.toMatchObject({ status: 409, message: "This team's season is over and its photos have been deleted, so no more can be added." });
		expect(deps.images.stored.size).toBe(0);
	});
	it("says to try again in a minute when Images can't take it", async () => {
		const { deps, filmer } = await setup();
		deps.images.failNextUpload = true;
		await expect(addPhoto(deps, filmer, testJpeg(), "")).rejects.toMatchObject({ status: 502, message: "Couldn't save the photo just now. Try again in a minute." });
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM photos").first("n")).toBe(0);
	});
	it("gets its number before Images has it, so Images names it as it downloads; until then it's on no page", async () => {
		const { deps, filmer } = await setup();
		await addPhoto(deps, filmer, testJpeg(), "2026-10-16T18:50:00");
		const upload = deps.images.upload.bind(deps.images);
		const seen: number[] = [];
		vi.spyOn(deps.images, "upload").mockImplementation(async (bytes, o) => {
			seen.push((await listPhotos(deps.db, deps.team.id)).length);
			return upload(bytes, o);
		});
		const id = await addPhoto(deps, filmer, testJpeg(), "2026-10-23T19:05:12");
		expect(id).toBe(2);
		expect(seen).toEqual([1]);
		expect(deps.images.stored.get("img-2")?.filename).toBe("saints-b12-1-2026-10-23-photo-2.jpg");
		expect(await row(deps, id)).toMatchObject({ image_id: "img-2", deleted_at: null, deleted_reason: null });
	});
	it("leaves no row behind when Images can't take it", async () => {
		const { deps, filmer } = await setup();
		deps.images.failNextUpload = true;
		await expect(addPhoto(deps, filmer, testJpeg(), "")).rejects.toMatchObject({ status: 502 });
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM photos").first("n")).toBe(0);
	});
	it("sends nothing to Images when its row can't be saved", async () => {
		const { deps, filmer } = await setup();
		const gone = { ...filmer, id: 99 }; // no such member: the row's insert fails
		await expect(addPhoto(deps, gone, testJpeg(), "")).rejects.toThrow(/FOREIGN KEY/);
		expect(deps.images.stored.size).toBe(0);
	});
	it("takes the image out of Images again when its row has gone meanwhile, and says so in the log if that fails too", async () => {
		const { deps, filmer } = await setup();
		const upload = deps.images.upload.bind(deps.images);
		vi.spyOn(deps.images, "upload").mockImplementation(async (bytes, o) => {
			await deps.db.prepare("DELETE FROM photos").run();
			return upload(bytes, o);
		});
		await expect(addPhoto(deps, filmer, testJpeg(), "")).rejects.toThrow(/photo's row/);
		expect(deps.images.stored.size).toBe(0);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const remove = vi.spyOn(deps.images, "delete").mockRejectedValueOnce(new Error("Images unavailable (503)"));
		await expect(addPhoto(deps, filmer, testJpeg(), "")).rejects.toThrow(/photo's row/);
		expect(remove).toHaveBeenCalledWith("img-2");
		expect(log.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(["photo_cleanup_failed"]);
		log.mockRestore();
	});
});

describe("the Photos page's order", () => {
	it("newest taken first; taken in the same second, the one added later first", async () => {
		const { deps, filmer } = await setup();
		for (const takenAt of ["2026-10-23T19:05:12", "2026-10-16T18:50:00", "2026-10-23T19:05:12", "2026-10-23T20:01:00"]) await addPhoto(deps, filmer, testJpeg(), takenAt);
		expect((await listPhotos(deps.db, deps.team.id)).map((p) => [p.id, p.takenAt])).toEqual([
			[4, "2026-10-23T20:01:00"], [3, "2026-10-23T19:05:12"], [1, "2026-10-23T19:05:12"], [2, "2026-10-16T18:50:00"],
		]);
	});
});

describe("deleting photos", () => {
	it("Images first (gone already is fine), then the row with why, closing its removal requests", async () => {
		const { deps, filmer } = await setup();
		const id = await addPhoto(deps, filmer, testJpeg(), "");
		await deps.db.prepare("INSERT INTO photo_removal_requests (team_id, photo_id, member_id, created_at) VALUES (?, ?, 2, ?)").bind(deps.team.id, id, NOW.toISOString()).run();
		deps.images.down = true;
		await expect(deletePhoto(deps, (await getPhoto(deps.db, deps.team.id, id))!, "admin", 1)).rejects.toThrow(/Images unavailable/);
		expect(await getPhoto(deps.db, deps.team.id, id)).not.toBeNull();
		deps.images.down = false;
		deps.images.stored.clear();
		await deletePhoto(deps, (await getPhoto(deps.db, deps.team.id, id))!, "admin", 1);
		expect(await row(deps, id)).toMatchObject({ deleted_at: NOW.toISOString(), deleted_reason: "admin" });
		expect(await getPhoto(deps.db, deps.team.id, id)).toBeNull();
		expect(await deps.db.prepare("SELECT status, resolved_by FROM photo_removal_requests").first()).toEqual({ status: "photo_deleted", resolved_by: 1 });
	});
	it("retention deletes the photos whose season is over, 50 a run", async () => {
		const { deps, filmer } = await setup();
		for (let i = 0; i < 52; i++) await addPhoto(deps, filmer, testJpeg(), "");
		const kept = await addPhoto(deps, filmer, testJpeg(), "");
		await deps.db.prepare("UPDATE photos SET delete_after = '2026-10-24T07:00:00.000Z' WHERE id <> ?").bind(kept).run();
		expect(await enforcePhotoRetention(deps)).toEqual({ photosExpired: 50, errors: [] });
		expect(await enforcePhotoRetention(deps)).toEqual({ photosExpired: 2, errors: [] });
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM photos WHERE deleted_reason = 'retention'").first("n")).toBe(52);
		expect([...deps.images.stored.keys()]).toEqual([`img-${kept}`]);
	});
});
