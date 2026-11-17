import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { getActiveMember } from "../../../src/features/members/members-repository.ts";
import { reservePhoto } from "../../../src/features/photos/photos-repository.ts";
import { addPhoto } from "../../../src/features/photos/photos-service.ts";
import { photoLimits } from "../../../src/features/photos/photo-limits.ts";
import { makeClient } from "../../helpers/app.ts";
import { B12_1, createTestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";
import { addTeam } from "../../helpers/two-teams.ts";

// Saturday 24 Oct 2026, 7pm in the club's time zone.
const NOW = new Date("2026-10-24T08:00:00Z");
const KEY = "0b7f3c2e-5d1a-4c8e-9f60-2a4b6c8d0e1f";

async function setup() {
	const deps = createTestDeps(NOW);
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'f@x.com', 'Fran Filmer', 'filmer')").bind(deps.team.id).run();
	const filmer = (await getActiveMember(deps.db, deps.team.id, 2))!;
	const count = async () => (await deps.db.prepare("SELECT COUNT(*) AS n FROM photos WHERE team_id = ?").bind(deps.team.id).first<{ n: number }>())!.n;
	const logged = async () => (await deps.db.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE team_id = ? AND action = 'photo_added'").bind(deps.team.id).first<{ n: number }>())!.n;
	return { deps, filmer, count, logged };
}

/** The phone's post, as photos.js sends it: the photo it made, when it was taken, and its key (none from an older page). */
function upload(key?: string): RequestInit {
	const body = new FormData();
	body.set("photo", new File([testJpeg()], "photo.jpg", { type: "image/jpeg" }));
	body.set("takenAt", "2026-10-23T19:05:12");
	if (key !== undefined) body.set("key", key);
	return { method: "POST", body, headers: { "X-Courtside-Team": B12_1.id } };
}

describe("0011 a key for each photo the phone sends", () => {
	it("keeps every photo already there, with no key, and holds a team to one photo a key", () => {
		const db = new DatabaseSync(":memory:");
		const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
		// Each file in a transaction, as D1 applies them (so its deferred foreign keys hold).
		const apply = (f: string) => db.exec(`BEGIN; ${readFileSync(`migrations/${f}`, "utf8")}; COMMIT;`);
		for (const f of files.filter((f) => f < "0011")) apply(f);
		// The first schema seeds no team: the photos' team, and the member who added them.
		db.exec("INSERT INTO teams (id, name, code, season_start) VALUES ('b12.1-2026', 'U12 Boys 12.1', 'b12.1', 2026)");
		db.exec("INSERT INTO members (id, team_id, email, role) VALUES (1, 'b12.1-2026', 'f@x.com', 'filmer')");
		const insert = (team: string, image: string, key: string | null) => db.prepare(`INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by,
			delete_after, created_at${key === null ? "" : ", upload_key"}) VALUES (?, ?, '2026-10-23T19:05:12', 1, 1, 1, 1, 'x', 'x'${key === null ? "" : ", ?"})`)
			.run(...[team, image, ...(key === null ? [] : [key])]);
		insert("b12.1-2026", "img-old", null);
		apply("0011_photo_upload_key.sql");
		expect(db.prepare("SELECT id, image_id, upload_key FROM photos").all()).toEqual([{ id: 1, image_id: "img-old", upload_key: null }]);
		db.exec("INSERT INTO teams (id, name, code, season_start) VALUES ('g14.5-2026', 'U14 Girls 14.5', 'g14.5', 2026)");
		insert("b12.1-2026", "img-a", null);
		insert("b12.1-2026", "img-b", KEY);
		insert("g14.5-2026", "img-c", KEY);
		expect(() => insert("b12.1-2026", "img-d", KEY)).toThrow(/UNIQUE/);
	});
});

describe("a photo sent again with its key", () => {
	it("is the same photo: one row, one image in Images, one line in the Log", async () => {
		const { deps, filmer, count, logged } = await setup();
		const first = await addPhoto(deps, filmer, testJpeg(), "2026-10-23T19:05:12", KEY);
		const again = await addPhoto(deps, filmer, testJpeg(), "2026-10-23T19:05:12", KEY);
		expect(again).toBe(first);
		expect(await count()).toBe(1);
		expect(deps.images.stored.size).toBe(1);
		expect(deps.images.deleted).toEqual([]);
		expect(await logged()).toBe(1);
	});
	it("is still the same photo once it's been deleted, rather than coming back", async () => {
		const { deps, filmer, count } = await setup();
		const first = await addPhoto(deps, filmer, testJpeg(), "", KEY);
		await deps.db.prepare("UPDATE photos SET deleted_at = 'x', deleted_reason = 'admin' WHERE id = ?").bind(first).run();
		expect(await addPhoto(deps, filmer, testJpeg(), "", KEY)).toBe(first);
		expect(await count()).toBe(1);
	});
	it("whose first try never reached Images (the Worker stopped) is added now, in that row's place", async () => {
		const { deps, filmer, count } = await setup();
		await reservePhoto(deps.db, {
			teamId: deps.team.id, takenAt: "2026-10-23T19:05:12", width: 1, height: 1, bytes: 1, uploadedBy: 2, deleteAfter: "2027-12-31T13:00:00.000Z", createdAt: NOW.toISOString(), uploadKey: KEY,
		}, photoLimits(NOW));
		const id = await addPhoto(deps, filmer, testJpeg(), "2026-10-23T19:05:12", KEY);
		expect(await count()).toBe(1);
		expect(await deps.db.prepare("SELECT image_id, upload_key, deleted_at FROM photos WHERE id = ?").bind(id).first()).toEqual({ image_id: "img-1", upload_key: KEY, deleted_at: null });
	});
	it("sent twice at once ends as one photo, and Images keeps only its image", async () => {
		const { deps, filmer, count } = await setup();
		const tries = await Promise.allSettled([addPhoto(deps, filmer, testJpeg(), "", KEY), addPhoto(deps, filmer, testJpeg(), "", KEY)]);
		expect(tries.some((t) => t.status === "fulfilled")).toBe(true);
		const shown = await deps.db.prepare("SELECT image_id FROM photos WHERE team_id = ? AND deleted_at IS NULL").bind(deps.team.id).all<{ image_id: string }>();
		expect(shown.results).toHaveLength(1);
		expect(await count()).toBe(1);
		expect([...deps.images.stored.keys()]).toEqual([shown.results[0]!.image_id]);
	});
	it("is a new photo in another team, and without a key each one sent is added, as before", async () => {
		const { deps, filmer, count } = await setup();
		await addPhoto(deps, filmer, testJpeg(), "");
		await addPhoto(deps, filmer, testJpeg(), "");
		expect(await count()).toBe(2);
		await addPhoto(deps, filmer, testJpeg(), "", KEY);
		const other = { ...deps, team: await addTeam(deps.db) };
		await addPhoto(other, filmer, testJpeg(), "", KEY);
		expect(deps.images.stored.size).toBe(4);
	});
});

describe("POST /api/photos with a key", () => {
	it("answers the same photo when it's sent again; one with no key, or a key that isn't one, is added as before", async () => {
		const { deps, count } = await setup();
		const filmer = makeClient(deps, "f@x.com");
		const id = async (init: RequestInit) => { const res = await filmer("/api/photos", init); expect(res.status).toBe(201); return ((await res.json()) as { data: { id: number } }).data.id; };
		const first = await id(upload(KEY));
		expect(await id(upload(KEY))).toBe(first);
		expect(await count()).toBe(1);
		await id(upload());
		await id(upload("not a key; DROP TABLE photos"));
		await id(upload(""));
		expect(await count()).toBe(4);
		expect(deps.images.stored.size).toBe(4);
	});
});
