import { describe, expect, it } from "vitest";
import { type Member } from "../../../src/features/members/members-repository.ts";
import { findActiveMemberByEmail } from "../../helpers/members.ts";
import { startUpload } from "../../../src/features/videos/upload-service.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

/** A parent's upload of the seeded game (Round 9 vs Lakeside Rockets), finished, so Stream has its copy. */
async function uploaded(deps: TestDeps) {
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'sam@x.com', 'Sam', 'filmer')").bind(deps.team.id).run();
	const sam = (await findActiveMemberByEmail(deps.db, deps.team.id, "sam@x.com")) as Member;
	const gameId = await seedGame(deps);
	const { videoId } = await startUpload(deps, sam, { gameId, fileName: "game.mov", fileSize: 100 * 1024 * 1024, contentType: "video/quicktime" });
	await makeClient(deps, "sam@x.com")(`/api/uploads/${videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
	return { gameId, videoId, uid: (await getVideo(deps.db, deps.team.id, videoId))!.streamUid! };
}
const tickets = async (deps: TestDeps) => (await deps.db.prepare("SELECT source, alert_kind, title, topic, message, status FROM support_requests ORDER BY id").all()).results;

describe("Stream's copy of a video is named for its game, so it's clear which game it is", () => {
	it("the team, the game and when it was played", async () => {
		const deps = createTestDeps();
		const { videoId, gameId } = await uploaded(deps);
		expect(deps.stream.uploads[0].meta).toMatchObject({
			name: "Saints B12.1 · Round 9 · vs Lakeside Rockets · Sun 11 Oct 2026, 11:40am", videoId: String(videoId), gameId: String(gameId),
		});
	});
});

describe("a video Stream can't process raises an alert for the admins", () => {
	it("opens a ticket for the admins, emailed once, saying which game, why, and what to do", async () => {
		const deps = createTestDeps();
		const { videoId, uid } = await uploaded(deps);
		deps.stream.videos.set(uid, { readyToStream: false, state: "error", errorReason: "The video exceeded the maximum acceptable duration.", durationSeconds: -1 });
		await runSync(deps);
		await runSync(deps);
		// Tried again by hand while its ticket's open, and failed again: still the one ticket.
		await deps.db.prepare("UPDATE videos SET status = 'processing' WHERE id = ?").bind(videoId).run();
		await runSync(deps);
		const all = await tickets(deps);
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({
			source: "site", alert_kind: `video_failed:${videoId}`, topic: "videos", status: "new",
			title: "A video couldn't be processed: Saints B12.1 · Round 9 · vs Lakeside Rockets",
		});
		expect(all[0].message).toContain("Sun 11 Oct 2026, 11:40am, uploaded by Sam");
		expect(all[0].message).toContain("Stream said: The video exceeded the maximum acceptable duration.");
		expect(all[0].message).toContain(`Stream video ${uid}`);
		const sent = deps.email.sent.filter((e) => e.subject.includes("couldn't be processed"));
		expect(sent).toHaveLength(1);
		expect(sent[0].subject).toBe("Courtside: A video couldn't be processed: Saints B12.1 · Round 9 · vs Lakeside Rockets (#1)");
	});

	it("each failed video is its own ticket", async () => {
		const deps = createTestDeps();
		const first = await uploaded(deps);
		deps.stream.videos.set(first.uid, { readyToStream: false, state: "error", errorReason: "", durationSeconds: -1 });
		await runSync(deps);
		const gameId = await seedGame(deps, { startsAt: "2026-10-18T09:00", roundLabel: "10", opponent: "Hillcrest Rovers" });
		const sam = (await findActiveMemberByEmail(deps.db, deps.team.id, "sam@x.com")) as Member;
		const { videoId } = await startUpload(deps, sam, { gameId, fileName: "g2.mov", fileSize: 1024, contentType: "video/quicktime" });
		await makeClient(deps, "sam@x.com")(`/api/uploads/${videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		deps.stream.videos.set((await getVideo(deps.db, deps.team.id, videoId))!.streamUid!, { readyToStream: false, state: "error", errorReason: "", durationSeconds: -1 });
		await runSync(deps);
		expect((await tickets(deps)).map((t) => t.title)).toEqual([
			"A video couldn't be processed: Saints B12.1 · Round 9 · vs Lakeside Rockets",
			"A video couldn't be processed: Saints B12.1 · Round 10 · vs Hillcrest Rovers",
		]);
		expect((await tickets(deps))[0].message).toContain("Stream said: no reason given");
	});

	it("the game's page says so in the big card over the court, not a line of small print", async () => {
		const deps = createTestDeps();
		const { gameId, uid } = await uploaded(deps);
		deps.stream.videos.set(uid, { readyToStream: false, state: "error", errorReason: "", durationSeconds: -1 });
		await runSync(deps);
		const page = await (await makeClient(deps)(`/games/${gameId}`)).text();
		expect(page).toMatch(/<div class="pendcard failed" role="status">\s*<span class="pstate"><i aria-hidden="true"><\/i>Couldn't be processed<\/span><p>This video couldn't be processed\. An alert has been raised\.<\/p>/);
		expect(page).not.toContain('<p class="small">This video');
	});
});
