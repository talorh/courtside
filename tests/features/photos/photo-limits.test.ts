import { describe, expect, it } from "vitest";
import { getActiveMember } from "../../../src/features/members/members-repository.ts";
import { addPhoto } from "../../../src/features/photos/photos-service.ts";
import { makeClient } from "../../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";

// Saturday 24 Oct 2026, 7pm at the club (Australia/Melbourne).
const NOW = new Date("2026-10-24T08:00:00Z");
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const KEY = "0b7f3c2e-5d1a-4c8e-9f60-2a4b6c8d0e1f";

async function setup() {
	const deps = createTestDeps(NOW);
	for (const email of ["f@x.com", "g@x.com"]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, 'Fran', 'watcher')").bind(deps.team.id, email).run();
	}
	const member = async (email: string) => {
		const id = (await deps.db.prepare("SELECT id FROM members WHERE team_id = ? AND email = ?").bind(deps.team.id, email).first<number>("id"))!;
		return (await getActiveMember(deps.db, deps.team.id, id))!;
	};
	return { deps, fran: await member("f@x.com"), gus: await member("g@x.com") };
}

/** `n` photos `by` added at `at`, deleted ones when `deleted`. */
async function added(deps: TestDeps, by: number, at: string, n: number, deleted = false) {
	await deps.db.prepare(`WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < ?)
		INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at, deleted_reason)
		SELECT ?, 'seeded-' || ? || '-' || i, '2026-10-23T19:05:12', 1, 1, 1, ?, '2027-12-31T13:00:00.000Z', ?, ?, ? FROM k`)
		.bind(n, deps.team.id, crypto.randomUUID(), by, at, deleted ? at : null, deleted ? "admin" : null).run();
}

const refusal = (p: Promise<unknown>) => p.then(() => null, (err: { status?: number; code?: string; message?: string }) => ({ status: err.status, code: err.code, message: err.message }));

describe("500 photos a day for each person", () => {
	it("refuses the 501st without sending Images anything, says when there's room, and leaves others free to add theirs", async () => {
		const { deps, fran, gus } = await setup();
		// 100 at 9pm last night, 399 more (some since deleted) at 6pm today, and some from two days ago that no longer count.
		await added(deps, fran.id, ago(22 * HOUR), 100);
		await added(deps, fran.id, ago(HOUR), 300);
		await added(deps, fran.id, ago(HOUR), 99, true);
		await added(deps, fran.id, ago(48 * HOUR), 200);
		await addPhoto(deps, fran, testJpeg(), "");
		expect(await refusal(addPhoto(deps, fran, testJpeg(), ""))).toEqual({
			status: 429, code: "photo_limit",
			message: "You've added 500 photos in the last 24 hours, the most one person can add in a day. You can add more from 9:00pm.",
		});
		expect(deps.images.stored.size).toBe(1);
		await addPhoto(deps, gus, testJpeg(), "");
		expect(deps.images.stored.size).toBe(2);
	});
	it("fits again once they're a day old", async () => {
		const { deps, fran } = await setup();
		await added(deps, fran.id, ago(23 * HOUR), 500);
		expect(await refusal(addPhoto(deps, fran, testJpeg(), ""))).toMatchObject({ status: 429 });
		deps.now = () => new Date(NOW.getTime() + HOUR);
		expect(await addPhoto(deps, fran, testJpeg(), "")).toBeGreaterThan(0);
	});
	it("answers a photo sent again with its key, at the limit, with the photo it already added, counting it once", async () => {
		const { deps, fran } = await setup();
		await added(deps, fran.id, ago(HOUR), 499);
		const first = await addPhoto(deps, fran, testJpeg(), "", KEY);
		expect(await addPhoto(deps, fran, testJpeg(), "", KEY)).toBe(first);
		expect(await refusal(addPhoto(deps, fran, testJpeg(), ""))).toMatchObject({ status: 429 });
		expect(deps.images.stored.size).toBe(1);
	});
	it("doesn't count a photo Images turned down", async () => {
		const { deps, fran } = await setup();
		await added(deps, fran.id, ago(HOUR), 499);
		deps.images.failNextUpload = true;
		expect(await refusal(addPhoto(deps, fran, testJpeg(), ""))).toMatchObject({ status: 502 });
		expect(await addPhoto(deps, fran, testJpeg(), "")).toBeGreaterThan(0);
	});
});

describe("2,000 photos a day for each team", () => {
	it("refuses a photo past the team's 2,000, whoever added the rest, and says when there's room", async () => {
		const { deps, fran, gus } = await setup();
		await added(deps, gus.id, ago(20 * HOUR), 1000, true);
		await added(deps, 1, ago(2 * HOUR), 1000);
		expect(await refusal(addPhoto(deps, fran, testJpeg(), ""))).toEqual({
			status: 429, code: "photo_limit",
			message: "The team has added 2,000 photos in the last 24 hours, the most a team can add in a day. More can be added from 11:00pm.",
		});
		expect(deps.images.stored.size).toBe(0);
	});
	it("says so on the Photos page's own request, as JSON the page shows", async () => {
		const { deps } = await setup();
		await added(deps, 1, ago(2 * HOUR), 2000);
		const body = new FormData();
		body.set("photo", new File([testJpeg()], "photo.jpg", { type: "image/jpeg" }));
		body.set("takenAt", "2026-10-23T19:05:12");
		const res = await makeClient(deps, "f@x.com")("/api/photos", { method: "POST", body, headers: { "X-Courtside-Team": B12_1.id } });
		expect(res.status).toBe(429);
		expect(await res.json()).toMatchObject({ ok: false, error: { code: "photo_limit", message: expect.stringContaining("The team has added 2,000 photos") } });
	});
});
