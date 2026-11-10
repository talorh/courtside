import { describe, expect, it } from "vitest";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { aDayLater } from "../../helpers/purge.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

async function setup() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'jo@x.com', 'watcher')").bind(deps.team.id).run();
	const gameId = await seedGame(deps);
	const videoId = await seedVideo(deps, { gameId, streamUid: "u1", r2Key: "originals/a.mov" });
	return { deps, gameId, videoId, jo: makeClient(deps, "jo@x.com"), admin: makeClient(deps) };
}
const openIds = (deps: ReturnType<typeof createTestDeps>) =>
	deps.db.prepare("SELECT id FROM removal_requests WHERE status = 'open'").all<{ id: number }>().then((r) => r.results.map((x) => x.id));

describe("removal requests", () => {
	it("lets a parent ask, and shows the request to admins", async () => {
		const { deps, gameId, videoId, jo, admin } = await setup();
		const res = await jo(`/videos/${videoId}/removal-requests`, form({ reason: "My son's injury is shown" }));
		expect(res.headers.get("Location")).toBe(`/games/${gameId}?done=removal`);
		const page = await (await admin("/manage")).text();
		expect(page).toContain("jo@x.com");
		expect(page).toContain("My son&#39;s injury is shown");
		expect(await openIds(deps)).toHaveLength(1);
	});
	it("deleting from a request removes the media and closes every open request for that video", async () => {
		const { deps, videoId, jo, admin } = await setup();
		await jo(`/videos/${videoId}/removal-requests`, form({ reason: "" }));
		await jo(`/videos/${videoId}/removal-requests`, form({ reason: "again" }));
		// Asking twice is one request (and one notification).
		expect(await openIds(deps)).toHaveLength(1);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE kind = 'removal_requested'").first<number>("n")).toBe(1);
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'kim@x.com', 'watcher')").bind(deps.team.id).run();
		await makeClient(deps, "kim@x.com")(`/videos/${videoId}/removal-requests`, form({ reason: "me too" }));
		expect(await openIds(deps)).toHaveLength(2);
		const [first] = await openIds(deps);
		expect((await admin(`/removal-requests/${first}/delete-video`, form({ confirm: "yes" }))).headers.get("Location")).toBe("/manage?done=deleted");
		expect(await getVideo(deps.db, deps.team.id, videoId)).toBeNull();
		expect(await openIds(deps)).toEqual([]);
		await aDayLater(deps);
		expect(deps.stream.deleted).toEqual(["u1"]);
	});
	it("keeping a video closes the request; a video already deleted elsewhere just closes", async () => {
		const { deps, videoId, jo, admin } = await setup();
		await jo(`/videos/${videoId}/removal-requests`, form({ reason: "" }));
		const [id] = await openIds(deps);
		await admin(`/removal-requests/${id}/keep`, form({ note: "Spoke to Jo, all fine" }));
		expect(await openIds(deps)).toEqual([]);
		await jo(`/videos/${videoId}/removal-requests`, form({ reason: "" }));
		await admin(`/videos/${videoId}/delete`, form({ confirm: "yes" }));
		const [stale] = await openIds(deps);
		expect((await admin(`/removal-requests/${stale}/delete-video`, form({ confirm: "yes" }))).status).toBe(303);
		expect(await openIds(deps)).toEqual([]);
	});
	it("only admins can act on requests", async () => {
		const { videoId, jo } = await setup();
		await jo(`/videos/${videoId}/removal-requests`, form({ reason: "" }));
		expect((await jo("/removal-requests/1/keep", form({ note: "" }))).status).toBe(403);
	});
});
