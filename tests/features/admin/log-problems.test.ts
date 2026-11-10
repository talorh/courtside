import { afterEach, describe, expect, it, vi } from "vitest";
import { logProblem } from "../../../src/features/admin/problem-log.ts";
import { purgeProblems } from "../../../src/features/admin/problems-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// Problems in the admin Log: anything that failed, the site's own or a phone's, with who it happened to and which
// device. The same problem again within half an hour counts on its line, so an outage is a line, not thousands.
// Today in the tests: Thu 15 Oct 2026, 11am in the club's time zone (00:00 UTC).
const ANDROID = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36";
const at = (deps: TestDeps, iso: string) => { (deps as { now: () => Date }).now = () => new Date(iso); };
const problems = async (deps: TestDeps, query = "?show=problems") => {
	const html = await (await makeClient(deps)(`/admin/log${query}`)).text();
	return [...html.matchAll(/<td class="l-who"><a [^>]*>([^<]*)<\/a><\/td>\s*<td class="l-event"><a [^>]*>([^<]*)<\/a><\/td>\s*<td class="l-what">([^]*?)<\/td>[^]*?<td class="l-ip">(?:<a [^>]*>([^<]*)<\/a>)?/g)]
		.map((m) => `${m[1]} | ${m[2]} | ${m[3]}${m[4] ? ` | ${m[4]}` : ""}`.replaceAll("&#39;", "'").replaceAll("&quot;", '"'));
};

afterEach(() => vi.restoreAllMocks());

describe("problems in the admin Log", () => {
	it("counts the same problem again within half an hour on its line, and starts a new one after", async () => {
		const deps = createTestDeps();
		const fail = () => logProblem(deps, { kind: "site_problem", teamId: null, what: "PlayHQ couldn't be read", error: new Error("PlayHQ answered 503") });
		await fail();
		at(deps, "2026-10-15T00:20:00Z");
		await fail();
		at(deps, "2026-10-15T00:45:00Z");
		await fail();
		at(deps, "2026-10-15T01:30:00Z"); // 45 minutes on: a new line
		await fail();
		expect(await problems(deps)).toEqual([
			"The site | Site problem | PlayHQ couldn't be read: PlayHQ answered 503",
			"The site | Site problem | PlayHQ couldn't be read: PlayHQ answered 503 (3 times, 11:00am to 11:45am)",
		]);
	});

	it("a request that fails is one, with who was asking and their device", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(deps.images, "upload").mockRejectedValue(new Error("Images answered 500"));
		const body = new FormData();
		body.set("photo", new File([testJpeg()], "photo.jpg", { type: "image/jpeg" }));
		body.set("takenAt", "");
		const res = await makeClient(deps)("/api/photos", { method: "POST", body, headers: { "User-Agent": ANDROID } });
		expect(res.status).toBe(502);
		expect(await problems(deps)).toEqual([
			"sam@saints.example | Request failed | POST /api/photos failed (502): Couldn't save the photo just now. Try again in a minute.: Images answered 500 | Android, Chrome",
		]);
	});

	it("a Go live problem the phone reports, and only those it marks as problems", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T10:00", opponent: "Lakeside", roundLabel: "6" });
		await makeClient(deps)(`/api/live/${gameId}/events`, { ...jsonBody({ events: [{ s: 4, what: "page hidden" }, { s: 5, what: "camera stopped", p: true }] }), headers: { "Content-Type": "application/json", "User-Agent": ANDROID } });
		expect(await problems(deps)).toEqual(["sam@saints.example | Go live problem | Go live on Round 6 · vs Lakeside, Thu 15 Oct: camera stopped | Android, Chrome"]);
	});

	it("an upload or photos the phone says stopped", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-10T18:40", opponent: "Lakeside", roundLabel: "5" });
		const client = makeClient(deps);
		await client("/api/problems", jsonBody({ what: "upload", gameId, message: "This game has a video already.", status: 409 }));
		await client("/api/problems", jsonBody({ what: "photos", message: "Added 3 of 5. Not added: a.heic (it isn't a photo)." }));
		expect(await problems(deps)).toEqual([
			"sam@saints.example | Photos problem | Adding photos stopped on the phone: Added 3 of 5. Not added: a.heic (it isn't a photo).",
			"sam@saints.example | Upload problem | An upload of Round 5 · vs Lakeside, Sat 10 Oct stopped on the phone: This game has a video already. (409)",
		]);
		expect((await client("/api/problems", jsonBody({ what: "anything", message: "x" }))).status).toBe(400);
	});

	it("the 5-minute job's failures, under the team whose step it was", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const gameId = await seedGame(deps, { startsAt: "2026-10-14T18:40" });
		await seedVideo(deps, { gameId, status: "processing", streamUid: "p1", r2Key: "originals/k1" });
		vi.spyOn(deps.stream, "details").mockRejectedValue(new Error("Stream answered 500"));
		await expect(runSync(deps)).rejects.toThrow(/record\(s\) failed/);
		const lines = await problems(deps);
		expect(lines).toContain("The site | Job failed | The 5-minute job: Stream answered 500");
		const html = await (await makeClient(deps)("/admin/log?show=problems")).text();
		expect(html).toContain('<a class="teamtag" href="/admin/log?show=problems&amp;from=2026-10-09&amp;to=2026-10-15&amp;team=b12.1-2026" title="Only Saints B12.1 (2026/27)">Saints B12.1</a>');
	});

	it("has its own chip, is among the warnings, and goes after a month", async () => {
		const deps = createTestDeps();
		await logProblem(deps, { kind: "email_failed", teamId: null, who: "mum@x.com", what: "A sign-in code's email didn't send", error: new Error("Email Sending answered 500") });
		const html = await (await makeClient(deps)("/admin/log")).text();
		expect(html).toContain('Problems <span class="n">1</span>');
		expect(await problems(deps, "?warn=1")).toEqual(["mum@x.com | Email not sent | A sign-in code's email didn't send: Email Sending answered 500"]);
		await purgeProblems(deps.db, "2026-10-16T00:00:00.000Z");
		expect(await problems(deps)).toEqual([]);
	});
});
