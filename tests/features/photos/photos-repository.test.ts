import { describe, expect, it } from "vitest";
import { dropReservedPhoto, fillPhoto, getPhoto, reservePhoto } from "../../../src/features/photos/photos-repository.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

const NOW = "2026-10-24T08:00:00.000Z";

async function setup() {
	const deps = createTestDeps(new Date(NOW));
	const reserve = () => reservePhoto(deps.db, {
		teamId: deps.team.id, takenAt: "2026-10-23T19:05:12", width: 800, height: 600, bytes: 1000, uploadedBy: 1, deleteAfter: "2027-12-31T13:00:00.000Z", createdAt: NOW,
	});
	const imageOf = async (id: number) => (await deps.db.prepare("SELECT image_id FROM photos WHERE team_id = ? AND id = ?").bind(deps.team.id, id).first<{ image_id: string }>())?.image_id ?? null;
	return { deps, reserve, imageOf };
}

/** The queries `run` prepares, as written. */
async function queries(db: D1Database, run: (db: D1Database) => Promise<unknown>): Promise<string[]> {
	const seen: string[] = [];
	await run(new Proxy(db, { get: (target, key) => (key === "prepare" ? (sql: string) => { seen.push(sql); return target.prepare(sql); } : Reflect.get(target, key)) }));
	return seen;
}

describe("a photo's row, reserved before Images has its image", () => {
	it("is out of sight until it's filled, and is filled once only", async () => {
		const { deps, reserve, imageOf } = await setup();
		const id = await reserve();
		expect(await getPhoto(deps.db, deps.team.id, id)).toBeNull();
		expect(await fillPhoto(deps.db, deps.team.id, id, "img-1")).toBe(true);
		expect(await getPhoto(deps.db, deps.team.id, id)).toMatchObject({ id, imageId: "img-1" });
		expect(await fillPhoto(deps.db, deps.team.id, id, "img-2")).toBe(false);
		expect(await imageOf(id)).toBe("img-1");
	});
	it("is filled or dropped for its own team only", async () => {
		const { deps, reserve, imageOf } = await setup();
		const id = await reserve();
		expect(await fillPhoto(deps.db, "g14.2-2026", id, "img-1")).toBe(false);
		await dropReservedPhoto(deps.db, "g14.2-2026", id);
		expect(await imageOf(id)).toMatch(/^pending-/);
	});
	it("is dropped while it's still waiting; a filled one stays", async () => {
		const { deps, reserve, imageOf } = await setup();
		const [waiting, filled] = [await reserve(), await reserve()];
		await fillPhoto(deps.db, deps.team.id, filled, "img-2");
		await dropReservedPhoto(deps.db, deps.team.id, waiting);
		await dropReservedPhoto(deps.db, deps.team.id, filled);
		expect([await imageOf(waiting), await imageOf(filled)]).toEqual([null, "img-2"]);
	});
	it("names the waiting mark as a bound value, never written into the query", async () => {
		const { deps, reserve } = await setup();
		const [a, b] = [await reserve(), await reserve()];
		const seen = await queries(deps.db, async (db) => { await fillPhoto(db, deps.team.id, a, "img-1"); await dropReservedPhoto(db, deps.team.id, b); });
		expect(seen).toHaveLength(2);
		for (const sql of seen) {
			expect(sql).not.toContain("pending-");
			expect(sql).toContain("image_id LIKE ?");
		}
	});
});
