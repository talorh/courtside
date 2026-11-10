import { describe, expect, it } from "vitest";
import { enforcePhotoRetention } from "../../../src/features/photos/photos-service.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";

// Photos in the admin Log: added, deleted, a removal request asked for, kept or done, each with who and which device.
// Phones send photos one at a time, so one person's run of them (within half an hour of each other) is one line.
// Saturday 24 Oct 2026, 7pm in the club's time zone.
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1";
const at = (deps: TestDeps, iso: string) => { (deps as { now: () => Date }).now = () => new Date(iso); };
const rows = async (deps: TestDeps, query = "?show=photos") => {
	const html = await (await makeClient(deps)(`/admin/log${query}`)).text();
	return [...html.matchAll(/<td class="l-who"><a [^>]*>([^<]*)<\/a><\/td>[^]*?<td class="l-what">([^]*?)<\/td>[^]*?<td class="l-ip">(?:<a [^>]*>([^<]*)<\/a>)?/g)]
		.map((m) => `${m[1]} ${m[2]}${m[3] ? ` [${m[3]}]` : ""}`.replaceAll("&#39;", "'"));
};

async function setup() {
	const deps = createTestDeps(new Date("2026-10-24T08:00:00Z"));
	for (const [email, role] of [["p@x.com", "watcher"], ["f@x.com", "filmer"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, '', ?)").bind(deps.team.id, email, role).run();
	}
	const fran = makeClient(deps, "f@x.com");
	const add = async () => {
		const body = new FormData();
		body.set("photo", new File([testJpeg()], "photo.jpg", { type: "image/jpeg" }));
		body.set("takenAt", "");
		const res = await fran("/api/photos", { method: "POST", body, headers: { "User-Agent": IPHONE } });
		return ((await res.json()) as { data: { id: number } }).data.id;
	};
	return { deps, fran, pat: makeClient(deps, "p@x.com"), add };
}

describe("photos in the admin Log", () => {
	it("one person's photos added within half an hour of each other are one line, with the device", async () => {
		const { deps, add } = await setup();
		for (const iso of ["2026-10-24T08:00:00Z", "2026-10-24T08:10:00Z", "2026-10-24T08:40:00Z", "2026-10-24T10:00:00Z"]) {
			at(deps, iso);
			await add();
		}
		expect(await rows(deps)).toEqual([
			"f@x.com added a photo to Saints B12.1 [iPhone, Safari]",
			"f@x.com added 3 photos to Saints B12.1 (7:00pm to 7:40pm) [iPhone, Safari]",
		]);
	});

	it("deletes, removal requests, and what the team manager did with them", async () => {
		const { deps, fran, pat, add } = await setup();
		const [a, b, c, d] = [await add(), await add(), await add(), await add()];
		at(deps, "2026-10-24T09:00:00Z");
		await fran("/photos/delete", { method: "POST", body: new URLSearchParams([["confirm", "yes"], ["id", String(a)], ["id", String(b)]]) });
		at(deps, "2026-10-24T09:01:00Z");
		await pat(`/photos/${c}/removal-requests`, form({ reason: "Not me" }));
		await pat(`/photos/${d}/removal-requests`, form({ reason: "" }));
		const requests = (await deps.db.prepare("SELECT id FROM photo_removal_requests ORDER BY id").all<{ id: number }>()).results.map((r) => r.id);
		at(deps, "2026-10-24T09:05:00Z");
		const manager = makeClient(deps);
		await manager(`/photo-removal-requests/${requests[0]}/delete-photo`, form({ confirm: "yes" }));
		await manager(`/photo-removal-requests/${requests[1]}/keep`, form({ note: "It's fine" }));
		const lines = await rows(deps);
		expect(lines.slice(0, 5)).toEqual([
			"sam@saints.example kept one of Saints B12.1's photos after a removal request: “It's fine”",
			"sam@saints.example deleted one of Saints B12.1's photos after a removal request",
			"p@x.com asked for one of Saints B12.1's photos to be removed",
			"p@x.com asked for one of Saints B12.1's photos to be removed: “Not me”",
			"f@x.com deleted 2 of Saints B12.1's photos",
		]);
		expect(lines[5]).toBe("f@x.com added 4 photos to Saints B12.1 [iPhone, Safari]");
	});

	it("the site's own delete at the season's end is one line, by the site, with no device", async () => {
		const { deps, add } = await setup();
		await add();
		await add();
		await deps.db.prepare("UPDATE photos SET delete_after = '2026-10-24T08:30:00.000Z'").run();
		at(deps, "2026-10-24T09:00:00Z");
		await enforcePhotoRetention(deps);
		expect((await rows(deps))[0]).toBe("The site deleted 2 of Saints B12.1's photos: the season's over");
	});
});
