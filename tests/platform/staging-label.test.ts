import { describe, expect, it } from "vitest";
import { createHostedImages } from "../../src/platform/hosted-images.ts";
import { createStreamClient } from "../../src/platform/stream-client.ts";
import { createClipper } from "../../src/platform/stream-clips.ts";
import { createLiveClient } from "../../src/platform/stream-live.ts";
import { fakeFetch } from "../helpers/fake-fetch.ts";

const sent = (calls: Array<{ init: RequestInit }>, i: number) => JSON.parse(String(calls[i]!.init.body)) as { meta: Record<string, string> };
const CREATED = "2026-10-01T00:00:00.000Z";

// Staging shares the account's Stream and Images with the live site (docs/runbooks/staging.md), so whatever it makes
// says so, and the live site's nightly clean-up can tell (jobs/sweep-orphans.ts).
describe("staging's things in the account's shared Stream and Images", () => {
	it("labels every video, clip and live input staging makes, and nothing the live site makes", async () => {
		for (const site of ["staging", null] as const) {
			const { calls, fetch } = fakeFetch({ body: { success: true, result: { uid: "u", webRTC: { url: "w" } } } });
			const stream = { accountId: "a", apiToken: "t", fetch, site };
			await createStreamClient(stream).uploadFromUrl("https://r2.test/x", { meta: { videoId: "1", gameId: "2", teamId: "t1" } });
			await createClipper(stream).clip({ sourceUid: "s", startSeconds: 0, endSeconds: 5, name: "n", teamId: "t1" });
			await createLiveClient(stream).createInput("Game", "t1");
			const label = site ? { site } : {};
			expect(sent(calls, 0).meta, String(site)).toEqual({ videoId: "1", gameId: "2", teamId: "t1", ...label });
			// A clip's call, then the label put on the clip itself (Stream's clip call keeps only the name).
			expect(sent(calls, 1).meta, String(site)).toEqual({ name: "n", teamId: "t1", ...label });
			expect(sent(calls, 2).meta, String(site)).toEqual({ name: "n", teamId: "t1", ...label });
			expect(sent(calls, 3).meta, String(site)).toEqual({ name: "Game", teamId: "t1", ...label });
		}
	});

	it("lists which of Stream's videos and live inputs are staging's", async () => {
		const listed = { success: true, result: [{ uid: "a", created: CREATED, meta: { site: "staging" } }, { uid: "b", created: CREATED, meta: { teamId: "t1" } }, { uid: "c", created: CREATED }] };
		const { fetch } = fakeFetch({ body: listed });
		const stream = { accountId: "a", apiToken: "t", fetch };
		const want = [{ uid: "a", created: CREATED, site: "staging" }, { uid: "b", created: CREATED, site: null }, { uid: "c", created: CREATED, site: null }];
		expect(await createStreamClient(stream).listVideos()).toEqual(want.map((v) => ({ ...v, liveInput: null })));
		expect(await createLiveClient(stream).listInputs()).toEqual(want);
	});

	it("puts the team, and staging's label on staging, on a video Stream made by itself (a live recording)", async () => {
		for (const site of [null, "staging"]) {
			const { calls, fetch } = fakeFetch({ body: { success: true, result: {} } });
			await createStreamClient({ accountId: "a", apiToken: "t", fetch, site }).label("rec-1", { teamId: "t1" });
			expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/a/stream/rec-1");
			expect(calls[0]!.init.method).toBe("POST");
			expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ meta: { teamId: "t1", ...(site ? { site } : {}) } });
		}
	});
	it("labels staging's photos, and lists which photos are staging's", async () => {
		const stored = new Map<string, Record<string, unknown>>();
		const hosted = {
			async upload(_bytes: ArrayBuffer, o: { metadata?: Record<string, unknown> }) {
				const id = `img-${stored.size + 1}`;
				stored.set(id, o.metadata ?? {});
				return { id, requireSignedURLs: true, variants: [] };
			},
			async list() {
				return { images: [...stored].map(([id, meta]) => ({ id, uploaded: CREATED, meta, requireSignedURLs: true, variants: [] })), listComplete: true };
			},
		};
		const binding = { hosted } as unknown as ImagesBinding;
		await createHostedImages(binding, { now: () => new Date(CREATED), site: "staging" }).upload(new Uint8Array([1]), { teamId: "t1", uploadedBy: 1, filename: "photo.jpg" });
		await createHostedImages(binding, { now: () => new Date(CREATED) }).upload(new Uint8Array([1]), { teamId: "t2", uploadedBy: 2, filename: "photo.jpg" });
		expect(stored.get("img-1")).toEqual({ teamId: "t1", site: "staging" });
		expect(stored.get("img-2")).toEqual({ teamId: "t2" });
		expect(await createHostedImages(binding, { now: () => new Date(CREATED) }).list())
			.toEqual([{ id: "img-1", uploaded: CREATED, site: "staging" }, { id: "img-2", uploaded: CREATED, site: null }]);
	});
});
