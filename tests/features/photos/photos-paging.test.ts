import { describe, expect, it, vi } from "vitest";
import { listPhotos, type Photo } from "../../../src/features/photos/photos-repository.ts";
import { photoAndNeighbours, photosOnPage } from "../../../src/features/photos/photos-paging-repository.ts";
import { PHOTOS_PER_PAGE } from "../../../src/features/photos/views/photos-page.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addTeam, G14_5 } from "../../helpers/two-teams.ts";

const NOW = new Date("2026-10-24T08:00:00Z");
// Few times, so many photos share a second (a burst, or screenshots added together), in an order unlike their ids.
const TIMES = ["2026-10-23T19:05:12", "2026-10-16T18:50:00", "2026-10-23T19:05:12", "2026-10-24T08:00:00", "2026-10-23T19:05:13", "2026-10-16T18:50:00", "2026-10-23T19:05:12"];

/** 180 rows, most of them B12.1's (some deleted, some still waiting for Images) between another team's photos. */
async function seed(count = 180) {
	const deps = createTestDeps(NOW);
	await addTeam(deps.db);
	const insert = deps.db.prepare(`INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at)
		VALUES (?, ?, ?, 4, 3, 100, 1, '2027-12-31T13:00:00.000Z', '2026-10-24T07:00:00.000Z', ?)`);
	const gone: number[] = [];
	for (let i = 1; i <= count; i++) {
		const team = i % 9 === 0 ? G14_5.id : deps.team.id;
		const deleted = i % 11 === 0 ? "2026-10-24T00:00:00.000Z" : null;
		const image = i % 13 === 0 ? `pending-${i}` : `img-${i}`;
		await insert.bind(team, image, TIMES[(i * 5) % TIMES.length], i % 13 === 0 ? "x" : deleted).run();
		if (team === deps.team.id && (deleted || i % 13 === 0)) gone.push(i);
	}
	return { deps, gone, all: await listPhotos(deps.db, deps.team.id) };
}

/** The pages as the Photos page made them from every photo: a page past the end is the last one. */
function pageOf(all: Photo[], asked: number, per: number) {
	const pages = Math.max(1, Math.ceil(all.length / per));
	const page = Math.min(pages, asked);
	return { photos: all.slice((page - 1) * per, page * per), page, pages };
}

describe("a page of photos, read in SQL", () => {
	it("is the same photos in the same order as every page made from the whole list, ties and the last page included", async () => {
		const { deps, all } = await seed();
		expect(all.length).toBeGreaterThan(2 * PHOTOS_PER_PAGE);
		for (const per of [PHOTOS_PER_PAGE, 7]) {
			const last = Math.ceil(all.length / per);
			for (let asked = 1; asked <= last + 2; asked++) expect(await photosOnPage(deps.db, deps.team.id, asked, per)).toEqual(pageOf(all, asked, per));
		}
		expect(await photosOnPage(deps.db, deps.team.id, Number.MAX_SAFE_INTEGER, PHOTOS_PER_PAGE)).toEqual(pageOf(all, 99, PHOTOS_PER_PAGE));
	});
	it("is one empty page for a team with none, whichever page is asked for", async () => {
		const deps = createTestDeps(NOW);
		for (const asked of [1, 5]) expect(await photosOnPage(deps.db, deps.team.id, asked, PHOTOS_PER_PAGE)).toEqual({ photos: [], page: 1, pages: 1 });
	});
	it("counts and reads in one batch, so a photo deleted meanwhile can't leave a team that has photos an empty page", async () => {
		const { deps } = await seed(70);
		const batch = vi.spyOn(deps.db, "batch");
		const prepare = vi.spyOn(deps.db, "prepare");
		await photosOnPage(deps.db, deps.team.id, 2, PHOTOS_PER_PAGE);
		expect(batch).toHaveBeenCalledTimes(1);
		expect(batch.mock.calls[0]![0]).toHaveLength(prepare.mock.calls.length);
	});
});

describe("a photo and its neighbours, read in SQL", () => {
	it("are the newer and older photos and the page that every photo had from the whole list, in one batch", async () => {
		const { deps, all } = await seed();
		const batch = vi.spyOn(deps.db, "batch");
		for (const [at, photo] of all.entries()) {
			expect(await photoAndNeighbours(deps.db, deps.team.id, photo.id), `photo ${photo.id}`).toEqual({
				photo, newer: all[at - 1] ?? null, older: all[at + 1] ?? null, place: at,
			});
		}
		expect(batch).toHaveBeenCalledTimes(all.length);
	});
	it("are nothing for a deleted photo, one still waiting for Images, or another team's", async () => {
		const { deps, gone } = await seed();
		expect(gone.length).toBeGreaterThan(5);
		for (const id of [...gone, 9, 18, 9999]) expect(await photoAndNeighbours(deps.db, deps.team.id, id)).toBeNull();
	});
});

describe("the Photos pages, read in SQL", () => {
	it("link each photo to the same newer and older photos and back to the same page as before", async () => {
		const { deps, all } = await seed();
		const watcher = makeClient(deps);
		for (const [at, photo] of all.entries()) {
			const page = await (await watcher(`/photos/${photo.id}`)).text();
			const links = { newer: /href="\/photos\/(\d+)" rel="prev"/.exec(page)?.[1], older: /href="\/photos\/(\d+)" rel="next"/.exec(page)?.[1], back: /class="btn photoback" href="([^"]+)"/.exec(page)?.[1] };
			expect(links, `photo ${photo.id}`).toEqual({
				newer: all[at - 1]?.id.toString(), older: all[at + 1]?.id.toString(), back: `/photos?page=${Math.floor(at / PHOTOS_PER_PAGE) + 1}#p${photo.id}`,
			});
		}
		const last = Math.ceil(all.length / PHOTOS_PER_PAGE);
		for (const asked of [1, 2, last, last + 1]) {
			const page = await (await watcher(`/photos?page=${asked}`)).text();
			const shown = [...page.matchAll(/<li><a href="\/photos\/(\d+)" id="p\d+">/g)].map((m) => Number(m[1]));
			expect(shown, `page ${asked}`).toEqual(pageOf(all, asked, PHOTOS_PER_PAGE).photos.map((p) => p.id));
		}
	});
});
