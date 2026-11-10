import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveMember } from "../../../src/features/members/members-repository.ts";
import { getPhoto } from "../../../src/features/photos/photos-repository.ts";
import { addPhoto, enforcePhotoRetention } from "../../../src/features/photos/photos-service.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";

// Saturday 24 Oct 2026, 7pm in the club's time zone.
const NOW = new Date("2026-10-24T08:00:00Z");

afterEach(() => vi.restoreAllMocks());

async function setup() {
	const deps = createTestDeps(NOW);
	for (const [email, role] of [["p@x.com", "watcher"], ["q@x.com", "watcher"], ["c@x.com", "coach"], ["f@x.com", "filmer"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, role, role).run();
	}
	// The Watch and film person adds photo 1.
	await addPhoto(deps, (await getActiveMember(deps.db, deps.team.id, 5))!, testJpeg(), "2026-10-23T19:05:12");
	return {
		deps, watcher: makeClient(deps, "p@x.com"), other: makeClient(deps, "q@x.com"), coach: makeClient(deps, "c@x.com"), filmer: makeClient(deps, "f@x.com"),
		admin: makeClient(deps),
	};
}

const count = (deps: Awaited<ReturnType<typeof setup>>["deps"], status: string) =>
	deps.db.prepare("SELECT COUNT(*) AS n FROM photo_removal_requests WHERE status = ?").bind(status).first<number>("n");

describe("photo removal", () => {
	it("anyone else asks; whoever added it and a team manager don't ask, they delete", async () => {
		const { watcher, filmer, admin } = await setup();
		const res = await watcher("/photos/1/removal-requests", form({ reason: "blurry" }));
		expect(res.headers.get("Location")).toBe("/photos/1?done=removal");
		expect(await (await watcher("/photos/1?done=removal")).text()).toContain("Thanks. Sam will look at your request to remove the photo.");
		expect((await filmer("/photos/1/removal-requests", form({}))).status).toBe(409);
		expect((await admin("/photos/1/removal-requests", form({}))).status).toBe(409);
	});
	it("asking twice adds nothing; the team manager sees each request with the photo, and deletes it from Members", async () => {
		const { deps, watcher, coach, admin } = await setup();
		await watcher("/photos/1/removal-requests", form({ reason: "My lad's eyes are shut" }));
		await coach("/photos/1/removal-requests", form({}));
		await coach("/photos/1/removal-requests", form({ reason: "asking again" }));
		const members = await (await admin("/manage")).text();
		expect(members).toContain("Removal requests · 2 open");
		expect(members).toContain('<a href="/photos/1"><img src="https://imagedelivery.test/img-1/thumb?exp=1" alt="The photo" width="64" height="64"></a>');
		expect(members).toContain("<b>Photo taken Fri 23 Oct 2026</b>");
		expect(members).toContain('asked by p@x.com, Sat 24 Oct 2026, 7:00pm · "My lad&#39;s eyes are shut"');
		expect(members).toContain('action="/photo-removal-requests/1/delete-photo"');
		const notifications = await (await admin("/notifications")).text();
		expect(notifications).toContain("2 open removal requests.");
		expect(notifications).toContain('<a href="/photos">Photos</a>: <b>watcher</b> asked for a photo to be removed');
		expect((await coach("/notifications")).status).toBe(403);
		expect((await admin("/photo-removal-requests/1/delete-photo", form({ confirm: "yes" }))).headers.get("Location")).toBe("/manage?done=photodeleted");
		expect(await (await admin("/manage?done=photodeleted")).text()).toContain("Photo deleted.");
		expect(await getPhoto(deps.db, deps.team.id, 1)).toBeNull();
		expect(deps.images.stored.size).toBe(0);
		expect(await count(deps, "photo_deleted")).toBe(2);
		expect(await (await admin("/manage")).text()).not.toContain("Removal requests");
	});
	it("the team manager can keep the photo, and only team managers decide", async () => {
		const { deps, other, coach, admin } = await setup();
		await other("/photos/1/removal-requests", form({}));
		expect((await coach("/photo-removal-requests/1/keep", form({}))).status).toBe(403);
		expect((await coach("/photo-removal-requests/1/delete-photo", form({ confirm: "yes" }))).status).toBe(403);
		expect((await admin("/photo-removal-requests/1/keep", form({ note: "" }))).headers.get("Location")).toBe("/manage?done=photokept");
		expect(await (await admin("/manage?done=photokept")).text()).toContain("Request closed. The photo stays.");
		expect(await getPhoto(deps.db, deps.team.id, 1)).not.toBeNull();
		expect(await count(deps, "kept")).toBe(1);
		expect((await admin("/photo-removal-requests/1/keep", form({}))).status).toBe(404);
	});
	it("a photo deleted another way (from its page, or its season over) takes its requests with it", async () => {
		const { deps, watcher, other, admin } = await setup();
		await watcher("/photos/1/removal-requests", form({}));
		await admin("/photos/1/delete", form({ confirm: "yes" }));
		expect(await count(deps, "photo_deleted")).toBe(1);
		await addPhoto(deps, (await getActiveMember(deps.db, deps.team.id, 5))!, testJpeg(), "2026-10-23T19:06:00");
		await other("/photos/2/removal-requests", form({}));
		await deps.db.prepare("UPDATE photos SET delete_after = ?").bind(NOW.toISOString()).run();
		await enforcePhotoRetention(deps);
		expect(await count(deps, "photo_deleted")).toBe(2);
		expect(await (await admin("/manage")).text()).not.toContain("Removal requests");
	});
	it("the photo and its requests go together: if closing the requests fails, the photo stays for another try", async () => {
		const { deps, watcher, admin } = await setup();
		await watcher("/photos/1/removal-requests", form({}));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await deps.db.prepare("CREATE TRIGGER refuse BEFORE UPDATE ON photo_removal_requests BEGIN SELECT RAISE(ABORT, 'D1 went away'); END").run();
		expect((await admin("/photo-removal-requests/1/delete-photo", form({ confirm: "yes" }))).status).toBe(500);
		expect(await getPhoto(deps.db, deps.team.id, 1)).not.toBeNull();
		await deps.db.prepare("DROP TRIGGER refuse").run();
		expect((await admin("/photo-removal-requests/1/delete-photo", form({ confirm: "yes" }))).headers.get("Location")).toBe("/manage?done=photodeleted");
		expect(await getPhoto(deps.db, deps.team.id, 1)).toBeNull();
		expect(await count(deps, "photo_deleted")).toBe(1);
	});
});
