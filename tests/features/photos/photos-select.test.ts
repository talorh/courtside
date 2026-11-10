import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { getActiveMember } from "../../../src/features/members/members-repository.ts";
import { addPhoto } from "../../../src/features/photos/photos-service.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";

// Saturday 24 Oct 2026, 7pm in the club's time zone.
const NOW = new Date("2026-10-24T08:00:00Z");

async function setup() {
	const deps = createTestDeps(NOW);
	for (const [email, name, role] of [["p@x.com", "Pat Family", "watcher"], ["f@x.com", "Fran Filmer", "filmer"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, name, role).run();
	}
	const [pat, fran] = [(await getActiveMember(deps.db, deps.team.id, 2))!, (await getActiveMember(deps.db, deps.team.id, 3))!];
	const add = (by = fran, takenAt = "2026-10-23T19:05:12") => addPhoto(deps, by, testJpeg(), takenAt);
	return { deps, add, pat, watcher: makeClient(deps, "p@x.com"), filmer: makeClient(deps, "f@x.com"), admin: makeClient(deps) };
}

const ids = (...n: number[]) => n.map((id) => `id=${id}`).join("&");
const del = (...n: number[]): RequestInit => ({ method: "POST", body: new URLSearchParams([["confirm", "yes"], ...n.map((id) => ["id", String(id)])]) });

/** A zip's files, from its central directory: name, stored size and CRC, and the bytes at its local header. */
function unzip(zip: Uint8Array) {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	const end = zip.byteLength - 22;
	expect(view.getUint32(end, true)).toBe(0x06054b50);
	const count = view.getUint16(end + 10, true);
	const files: Array<{ name: string; crc: number; bytes: Uint8Array }> = [];
	for (let at = view.getUint32(end + 16, true), i = 0; i < count; i++) {
		expect(view.getUint32(at, true)).toBe(0x02014b50);
		expect(view.getUint16(at + 10, true)).toBe(0); // stored: a JPEG doesn't squeeze
		const size = view.getUint32(at + 20, true), nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
		const local = view.getUint32(at + 42, true);
		const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
		const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		files.push({ name, crc: view.getUint32(at + 16, true), bytes: zip.subarray(start, start + size) });
		at += 46 + nameLength + extra + comment;
	}
	return files;
}

describe("choosing several photos on the Photos page", () => {
	it("gives everyone a way to choose photos, each tile saying whether it's theirs to delete", async () => {
		const { add, pat, watcher, filmer } = await setup();
		await add();
		await add(pat);
		const page = await (await watcher("/photos")).text();
		expect(page).toContain('<form id="photopick" method="get" action="/photos/download">');
		expect(page).toContain('<input type="checkbox" name="id" value="1" aria-label="Choose this photo">');
		expect(page).toContain('<input type="checkbox" name="id" value="2" aria-label="Choose this photo" data-mine>');
		expect(page).toContain('<script type="module" src="/photos-pick.js"></script>');
		// Select photos above the photos; the bar after them, so it stays at the foot of the screen while scrolling.
		expect(page.indexOf('id="pick-start"')).toBeLessThan(page.indexOf('id="photopick"'));
		expect(page.indexOf('id="pickbar"')).toBeGreaterThan(page.indexOf("</form>", page.indexOf('id="photopick"')));
		expect(await (await filmer("/photos")).text()).toContain('<input type="checkbox" name="id" value="1" aria-label="Choose this photo" data-mine>');
	});
});

describe("downloading several photos", () => {
	it("sends them as one zip, each named as it downloads on its own, oldest added first", async () => {
		const { deps, add, watcher } = await setup();
		await add(undefined, "2026-10-16T18:50:00");
		await add();
		await add();
		const res = await watcher(`/photos/download?${ids(3, 1)}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/zip");
		expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="saints-b12-1-photos-2026-10-24.zip"');
		const files = unzip(new Uint8Array(await res.arrayBuffer()));
		expect(files.map((f) => f.name)).toEqual(["saints-b12-1-2026-10-16-photo-1.jpg", "saints-b12-1-2026-10-23-photo-3.jpg"]);
		for (const [i, f] of files.entries()) {
			expect(f.bytes).toEqual(deps.images.stored.get(`img-${[1, 3][i]}`)!.bytes);
			expect(f.crc).toBe(crc32(f.bytes));
		}
	});
	it("leaves out one deleted meanwhile or another team's, and is 404 when none are left", async () => {
		const { add, watcher, admin } = await setup();
		await add();
		await add();
		await admin("/photos/2/delete", del());
		expect(unzip(new Uint8Array(await (await watcher(`/photos/download?${ids(1, 2, 77)}`)).arrayBuffer())).map((f) => f.name)).toEqual(["saints-b12-1-2026-10-23-photo-1.jpg"]);
		expect((await watcher(`/photos/download?${ids(2, 77)}`)).status).toBe(404);
	});
	it("asks for at least one and at most a page's worth", async () => {
		const { watcher } = await setup();
		expect((await watcher("/photos/download")).status).toBe(400);
		expect((await watcher(`/photos/download?${ids(...Array.from({ length: 61 }, (_, i) => i + 1))}`)).status).toBe(400);
		expect((await watcher("/photos/download?id=abc")).status).toBe(400);
	});
});

describe("deleting several photos", () => {
	it("whoever added them can delete them together; they go from the page and from Images", async () => {
		const { deps, add, filmer } = await setup();
		await add();
		await add();
		await add();
		const res = await filmer("/photos/delete", del(1, 3));
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe("/photos?done=deleted-some");
		expect([...deps.images.stored.keys()]).toEqual(["img-2"]);
		const page = await (await filmer("/photos?done=deleted-some")).text();
		expect(page).toContain("Photos deleted.");
		expect(page).not.toContain('id="p1"');
		expect(page).toContain('id="p2"');
	});
	it("deletes none when any of them isn't theirs; a team manager can delete any", async () => {
		const { deps, add, pat, filmer, admin } = await setup();
		await add();
		await add(pat);
		expect((await filmer("/photos/delete", del(1, 2))).status).toBe(403);
		expect(deps.images.stored.size).toBe(2);
		expect((await admin("/photos/delete", del(1, 2))).status).toBe(303);
		expect(deps.images.stored.size).toBe(0);
	});
	it("needs the question answered, and at least one photo", async () => {
		const { deps, add, filmer } = await setup();
		await add();
		expect((await filmer("/photos/delete", { method: "POST", body: new URLSearchParams([["id", "1"]]) })).status).toBe(400);
		expect((await filmer("/photos/delete", del())).status).toBe(400);
		expect(deps.images.stored.size).toBe(1);
	});
});
