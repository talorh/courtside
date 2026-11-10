import { afterEach, describe, expect, it, vi } from "vitest";
import { getClip } from "../../../src/features/clips/clips-repository.ts";
import { deleteVideo } from "../../../src/features/videos/video-removal-service.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

afterEach(() => vi.restoreAllMocks());

async function setup() {
	const deps = createTestDeps();
	for (const [email, role] of [["coach@x.com", "coach"], ["p@x.com", "watcher"], ["q@x.com", "watcher"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, role, role).run();
	}
	const gameId = await seedGame(deps);
	const videoId = await seedVideo(deps, { gameId, streamUid: "u1", r2Key: "originals/a.mov" });
	const watcher = makeClient(deps, "p@x.com");
	// A parent makes clip 1.
	await watcher(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20", label: "My lad's three" }));
	return { deps, gameId, watcher, other: makeClient(deps, "q@x.com"), coach: makeClient(deps, "coach@x.com"), admin: makeClient(deps) };
}

const count = (deps: Awaited<ReturnType<typeof setup>>["deps"], status: string) =>
	deps.db.prepare("SELECT COUNT(*) AS n FROM clip_removal_requests WHERE status = ?").bind(status).first<number>("n");

describe("clip removal", () => {
	it("a parent can make a clip but not delete it, even their own: they ask, like everyone else", async () => {
		const { deps, gameId, watcher } = await setup();
		expect((await watcher("/clips/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		expect(await getClip(deps.db, deps.team.id, 1)).not.toBeNull();
		expect((await watcher("/clips/1/removal-requests", form({ reason: "blurry" }))).headers.get("Location")).toBe(`/games/${gameId}?done=clipremoval`);
	});
	it("other parents and coaches can't delete it, but can ask; the admin deletes it from Members", async () => {
		const { deps, gameId, other, coach, admin } = await setup();
		expect((await other("/clips/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		expect((await coach("/clips/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		expect((await other("/clips/1/removal-requests", form({ reason: "not my kid's best moment" }))).headers.get("Location"))
			.toBe(`/games/${gameId}?done=clipremoval`);
		await coach("/clips/1/removal-requests", form({}));
		await coach("/clips/1/removal-requests", form({ reason: "asking again" }));
		const members = await (await admin("/manage")).text();
		expect(members).toContain("Removal requests · 2 open");
		expect(members).toContain("<b>Clip: My lad&#39;s three</b>");
		expect(members).toContain('action="/clip-removal-requests/1/delete-clip"');
		expect(await (await admin("/notifications")).text()).toContain("asked for a highlight clip to be removed");
		expect(await (await coach("/notifications")).text()).not.toContain("asked for a highlight clip to be removed");
		expect((await admin("/clip-removal-requests/1/delete-clip", form({ confirm: "yes" }))).headers.get("Location")).toBe("/manage?done=clipdeleted");
		expect(await getClip(deps.db, deps.team.id, 1)).toBeNull();
		expect(await count(deps, "clip_deleted")).toBe(2);
		expect(await (await admin("/manage")).text()).not.toContain("Removal requests");
	});
	it("the admin can keep the clip, and only admins can resolve", async () => {
		const { deps, other, coach, admin } = await setup();
		await other("/clips/1/removal-requests", form({}));
		expect((await coach("/clip-removal-requests/1/keep", form({}))).status).toBe(403);
		expect((await admin("/clip-removal-requests/1/keep", form({ note: "" }))).headers.get("Location")).toBe("/manage?done=clipkept");
		expect(await getClip(deps.db, deps.team.id, 1)).not.toBeNull();
		expect(await count(deps, "kept")).toBe(1);
	});
	it("a team manager deleting the clip closes every open request for it; a team manager can't ask, they delete", async () => {
		const { deps, watcher, other, admin } = await setup();
		await other("/clips/1/removal-requests", form({}));
		await watcher("/clips/1/removal-requests", form({}));
		expect((await admin("/clips/1/removal-requests", form({}))).status).toBe(409);
		await admin("/clips/1/delete", form({ confirm: "yes" }));
		expect(await count(deps, "clip_deleted")).toBe(2);
	});
	it("a request for a clip whose video was deleted leaves the list straight away (the clip goes a day later)", async () => {
		const { deps, other, admin } = await setup();
		await other("/clips/1/removal-requests", form({}));
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, 1))!, "admin");
		expect(await (await admin("/manage")).text()).not.toContain("Removal requests");
	});
	it("the clip and its requests go together: if closing the requests fails, the clip stays for another try", async () => {
		const { deps, other, admin } = await setup();
		await other("/clips/1/removal-requests", form({}));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await deps.db.prepare("CREATE TRIGGER refuse BEFORE UPDATE ON clip_removal_requests BEGIN SELECT RAISE(ABORT, 'D1 went away'); END").run();
		expect((await admin("/clip-removal-requests/1/delete-clip", form({ confirm: "yes" }))).status).toBe(500);
		expect(await getClip(deps.db, deps.team.id, 1)).not.toBeNull();
		await deps.db.prepare("DROP TRIGGER refuse").run();
		expect((await admin("/clip-removal-requests/1/delete-clip", form({ confirm: "yes" }))).headers.get("Location")).toBe("/manage?done=clipdeleted");
		expect(await getClip(deps.db, deps.team.id, 1)).toBeNull();
		expect(await count(deps, "clip_deleted")).toBe(1);
	});
});
