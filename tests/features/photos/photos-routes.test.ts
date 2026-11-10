import { describe, expect, it, vi } from "vitest";
import { getActiveMember } from "../../../src/features/members/members-repository.ts";
import { addPhoto } from "../../../src/features/photos/photos-service.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";

// Saturday 24 Oct 2026, 7pm in the club's time zone.
const NOW = new Date("2026-10-24T08:00:00Z");

async function setup() {
	const deps = createTestDeps(NOW);
	for (const [email, name, role] of [["p@x.com", "Pat Family", "watcher"], ["f@x.com", "Fran Filmer", "filmer"], ["c@x.com", "Coach Kim", "coach"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, name, role).run();
	}
	const filmer = (await getActiveMember(deps.db, deps.team.id, 3))!;
	const add = (takenAt = "") => addPhoto(deps, filmer, testJpeg(), takenAt);
	return {
		deps, add, watcher: makeClient(deps, "p@x.com"), filmer: makeClient(deps, "f@x.com"), coach: makeClient(deps, "c@x.com"), admin: makeClient(deps),
	};
}

/** The phone's post: the photo it made, and when the photo was taken. */
function upload(bytes: Uint8Array, takenAt = ""): RequestInit {
	const body = new FormData();
	body.set("photo", new File([bytes], "photo.jpg", { type: "image/jpeg" }));
	body.set("takenAt", takenAt);
	return { method: "POST", body };
}

describe("the Photos page", () => {
	it("everyone sees it and everyone can add photos, families too", async () => {
		const { watcher, filmer, coach, admin } = await setup();
		for (const client of [watcher, filmer, coach, admin]) {
			const page = await (await client("/photos")).text();
			expect(page).toContain('<input id="photo-files" type="file" accept="image/*" multiple>');
			expect(page).toContain('<span class="small drop-hint">On a computer you can also drag photos onto this box.</span>');
			expect(page).toContain('<script type="module" src="/photos.js"></script>');
			expect(page).toContain("<p>No photos yet. Tap Choose photos to add yours.</p>");
		}
	});
	it("shows the newest taken first under the day each was taken, each a signed thumbnail opening its own page", async () => {
		const { add, watcher } = await setup();
		await add("2026-10-16T18:50:00");
		await add("2026-10-23T19:05:12");
		await add("2026-10-23T20:01:00");
		const page = await (await watcher("/photos")).text();
		expect(page.indexOf("<h2>Fri 23 Oct 2026</h2>")).toBeGreaterThan(-1);
		expect(page.indexOf("<h2>Fri 23 Oct 2026</h2>")).toBeLessThan(page.indexOf("<h2>Fri 16 Oct 2026</h2>"));
		expect(page).toContain('<a href="/photos/3" id="p3"><img src="https://imagedelivery.test/img-3/thumb?exp=1" alt="Photo, 8:01pm" width="512" height="512" loading="lazy"></a>');
		expect(page.indexOf('id="p3"')).toBeLessThan(page.indexOf('id="p2"'));
		expect(page.indexOf('id="p2"')).toBeLessThan(page.indexOf('id="p1"'));
		expect(page).not.toContain("Newer photos");
	});
	it("shows 60 a page, with links to newer and older ones", async () => {
		const { add, watcher } = await setup();
		for (let i = 0; i < 61; i++) await add(`2026-10-23T19:${String(i).padStart(2, "0")}:00`);
		const first = await (await watcher("/photos")).text();
		expect(first.match(/<li><a href="\/photos\//g)).toHaveLength(60);
		expect(first).toContain('<a class="btn" href="/photos?page=2">Older photos →</a>');
		const second = await (await watcher("/photos?page=2")).text();
		expect(second.match(/<li><a href="\/photos\//g)).toHaveLength(1);
		expect(second).toContain('id="p1"');
		expect(second).toContain('<a class="btn" href="/photos?page=1">← Newer photos</a>');
		expect((await watcher("/photos?page=9")).status).toBe(200);
	});
	it("still opens when Images can't sign the links, and says the photos can't be shown just now", async () => {
		const { deps, add, watcher } = await setup();
		await add();
		deps.images.down = true;
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await watcher("/photos");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("The photos can&#39;t be shown just now. Try again in a minute.");
		expect(log.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(["photo_links_failed"]);
		log.mockRestore();
	});
});

describe("a photo's page", () => {
	it("the photo, when it was taken, newer and older, and Download", async () => {
		const { add, watcher } = await setup();
		for (const takenAt of ["2026-10-16T18:50:00", "2026-10-23T19:05:12", "2026-10-23T20:01:00"]) await add(takenAt);
		const page = await (await watcher("/photos/2")).text();
		expect(page).toContain('<img src="https://imagedelivery.test/img-2/large?exp=1" alt="Photo taken Fri 23 Oct 2026, 7:05pm" width="640" height="480">');
		expect(page).toContain('<a class="btn" href="/photos/3" rel="prev">← Newer</a>');
		expect(page).toContain('<a class="btn" href="/photos/1" rel="next">Older →</a>');
		expect(page).toContain('<a class="btn photoback" href="/photos?page=1#p2">← All photos</a>');
		expect(page).toContain('href="/photos/2/download"');
		// On an iPhone it becomes Save photo, opening the share menu: the file's name is on the button.
		expect(page).toContain('<a class="btn primary" href="/photos/2/download" data-save-photo data-name="saints-b12-1-2026-10-23-photo-2.jpg">Download photo <span>');
		expect(page).toContain('<p class="small" data-save-hint hidden></p>');
		expect(page).toContain('<script type="module" src="/photo-save.js"></script>');
		expect(page).toContain('<script type="module" src="/photo-swipe.js"></script>');
		expect(page).toContain('<p class="small swipe-hint">Swipe left or right for the next photo.</p>');
		// The neighbours' pictures ride on the figure, for the swipe.
		expect(page).toMatch(/<figure class="photoview" data-id="2" data-thumb="https:\/\/imagedelivery\.test\/[^"]+\/thumb[^"]*" data-newer="3" data-newer-src="https:\/\/imagedelivery\.test\/[^"]+\/large[^"]*" data-newer-thumb="https:\/\/imagedelivery\.test\/[^"]+\/thumb[^"]*" data-older="1" data-older-src="https:\/\/imagedelivery\.test\/[^"]+\/large[^"]*" data-older-thumb="https:\/\/imagedelivery\.test\/[^"]+\/thumb[^"]*">/);
		expect(page).not.toContain("Added by");
		expect((await watcher("/photos/99")).status).toBe(404);
	});
	it("whoever added it can delete it; everyone else asks for it to be removed; the team manager sees who added it and can delete any", async () => {
		const { add, watcher, filmer, coach, admin } = await setup();
		await add("2026-10-23T19:05:12");
		for (const client of [watcher, coach]) {
			const page = await (await client("/photos/1")).text();
			expect(page).toContain('action="/photos/1/removal-requests"');
			expect(page).not.toContain('action="/photos/1/delete"');
		}
		const own = await (await filmer("/photos/1")).text();
		expect(own).toContain("<p class=\"small\">You added this photo. Added it by mistake? You can delete it.</p>");
		expect(own).toContain('action="/photos/1/delete"');
		expect(own).not.toContain("removal-requests");
		const page = await (await admin("/photos/1")).text();
		expect(page).toContain("Added by Fran Filmer, Sat 24 Oct 2026, 7:00pm.");
		expect(page).toContain('action="/photos/1/delete"');
		expect(page).not.toContain("removal-requests");
	});
	it("downloads the photo as a JPEG named for the day it was taken", async () => {
		const { deps, add, watcher } = await setup();
		await add("2026-10-23T19:05:12");
		const res = await watcher("/photos/1/download");
		expect(res.headers.get("Content-Type")).toBe("image/jpeg");
		expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="saints-b12-1-2026-10-23-photo-1.jpg"');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(deps.images.stored.get("img-1")!.bytes);
		deps.images.stored.clear();
		expect((await watcher("/photos/1/download")).status).toBe(404);
	});
});

describe("adding photos", () => {
	it("a Watch and film person's phone sends each one, and it's on the page", async () => {
		const { deps, filmer, watcher } = await setup();
		const res = await filmer("/api/photos", upload(testJpeg({ exif: true }), "2026-10-23T19:05:12"));
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ ok: true, data: { id: 1 } });
		expect(await deps.db.prepare("SELECT taken_at, uploaded_by FROM photos").first()).toEqual({ taken_at: "2026-10-23T19:05:12", uploaded_by: 3 });
		expect(await (await watcher("/photos")).text()).toContain('id="p1"');
	});
	it("Watch only can add one too", async () => {
		const { deps, watcher } = await setup();
		expect((await watcher("/api/photos", upload(testJpeg()))).status).toBe(201);
		expect(deps.images.stored.size).toBe(1);
	});
	it("refuses no photo, one over 10 MB, and what isn't a JPEG", async () => {
		const { deps, filmer } = await setup();
		const none = new FormData();
		none.set("takenAt", "");
		expect((await filmer("/api/photos", { method: "POST", body: none })).status).toBe(400);
		const big = await filmer("/api/photos", upload(new Uint8Array(10 * 1024 * 1024 + 1)));
		expect(big.status).toBe(413);
		expect(await big.json()).toEqual({ ok: false, error: { code: "too_big", message: "That photo is too big to add (10 MB at most)." } });
		expect((await filmer("/api/photos", { ...upload(testJpeg()), headers: { "Content-Length": String(11 * 1024 * 1024) } })).status).toBe(413);
		expect((await filmer("/api/photos", upload(new TextEncoder().encode("GIF89a")))).status).toBe(400);
		expect(deps.images.stored.size).toBe(0);
	});
});

describe("deleting a photo", () => {
	it("the team manager can delete any; it goes from the page and from Images", async () => {
		const { deps, add, coach, admin } = await setup();
		await add();
		expect((await coach("/photos/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		const res = await admin("/photos/1/delete", form({ confirm: "yes" }));
		expect(res.headers.get("Location")).toBe("/photos?done=deleted");
		expect(deps.images.stored.size).toBe(0);
		expect(await (await admin("/photos?done=deleted")).text()).toContain("Photo deleted.");
		expect((await admin("/photos/1")).status).toBe(404);
	});
	it("whoever added it can delete it (added by mistake), and no one else's", async () => {
		const { deps, add, watcher, filmer } = await setup();
		await add();
		expect((await watcher("/api/photos", upload(testJpeg()))).status).toBe(201);
		expect((await watcher("/photos/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		expect((await filmer("/photos/2/delete", form({ confirm: "yes" }))).status).toBe(403);
		expect((await watcher("/photos/2/delete", form({ confirm: "yes" }))).headers.get("Location")).toBe("/photos?done=deleted");
		expect((await filmer("/photos/1/delete", form({ confirm: "yes" }))).headers.get("Location")).toBe("/photos?done=deleted");
		expect(deps.images.stored.size).toBe(0);
	});
	it("whoever added it deletes it rather than asking for it to be removed", async () => {
		const { add, filmer } = await setup();
		await add();
		expect((await filmer("/photos/1/removal-requests", form({ reason: "" }))).status).toBe(409);
	});
});
