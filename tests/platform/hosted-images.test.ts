import { describe, expect, it } from "vitest";
import { createHostedImages } from "../../src/platform/hosted-images.ts";

/** A stand-in for the Worker's Images binding: what each call was asked, and a store of images. */
function binding() {
	const calls: string[] = [];
	const stored = new Map<string, { metadata: Record<string, unknown>; uploaded: string }>();
	let signed = 0;
	const hosted = {
		async upload(_bytes: ArrayBuffer, o: { requireSignedURLs?: boolean; metadata?: Record<string, unknown>; creator?: string; filename?: string }) {
			calls.push(`upload signed=${o.requireSignedURLs} creator=${o.creator} file=${o.filename}`);
			const id = `img-${stored.size + 1}`;
			stored.set(id, { metadata: o.metadata ?? {}, uploaded: `2026-10-2${stored.size}T00:00:00Z` });
			return { id, requireSignedURLs: true, variants: [] };
		},
		image: (id: string) => ({
			async signedUrl(o: { variant: string; expiresIn?: number }) {
				calls.push(`sign ${id}/${o.variant} for ${o.expiresIn}s`);
				return `https://imagedelivery.net/hash/${id}/${o.variant}?exp=${++signed}`;
			},
			async delete() { return stored.delete(id); },
			async bytes() { return stored.has(id) ? new Response("jpeg").body : null; },
			// A handle is a connection to Images: each one is closed once it's used.
			[(Symbol as unknown as { dispose: symbol }).dispose]() { calls.push(`closed ${id}`); },
		}),
		async list(o: { cursor?: string; filter?: { metadata?: Record<string, unknown> } }) {
			calls.push(`list ${JSON.stringify(o.filter)} cursor=${o.cursor ?? ""}`);
			const all = [...stored].filter(([, v]) => !o.filter || v.metadata.teamId === o.filter.metadata?.teamId).map(([id, v]) => ({ id, uploaded: v.uploaded, requireSignedURLs: true, variants: [] }));
			return o.cursor ? { images: all.slice(1), listComplete: true } : { images: all.slice(0, 1), cursor: "next", listComplete: all.length <= 1 };
		},
	};
	return { calls, stored, binding: { hosted } as unknown as ImagesBinding };
}

describe("hosted images", () => {
	it("closes each image's handle once it's used: a link, its bytes or a delete", async () => {
		const b = binding();
		const images = createHostedImages(b.binding, { now: () => new Date("2026-10-26T00:00:00Z") });
		await images.upload(new Uint8Array([1]), { teamId: "b12.1-2026", uploadedBy: 1, filename: "photo.jpg" });
		await images.url("img-1", "thumb");
		// The bytes are read through the handle: it stays open until they've all come through.
		const stream = await images.bytes("img-1");
		expect(b.calls.filter((c) => c.startsWith("closed"))).toEqual(["closed img-1"]);
		expect(await new Response(stream).text()).toBe("jpeg");
		await images.delete("img-1");
		expect(b.calls.filter((c) => /^(sign|closed)/.test(c))).toEqual(["sign img-1/thumb for 21600s", "closed img-1", "closed img-1", "closed img-1"]);
	});
	it("stores a photo as a private image, named as it downloads, with the team in its metadata and who added it", async () => {
		const b = binding();
		const images = createHostedImages(b.binding, { now: () => new Date("2026-10-26T00:00:00Z") });
		expect(await images.upload(new Uint8Array([1, 2, 3]), { teamId: "b12.1-2026", uploadedBy: 7, filename: "saints-b12-1-2026-10-23-photo-5.jpg" })).toBe("img-1");
		expect(b.calls).toEqual(["upload signed=true creator=7 file=saints-b12-1-2026-10-23-photo-5.jpg"]);
		expect(b.stored.get("img-1")?.metadata).toEqual({ teamId: "b12.1-2026" });
	});
	it("signs a link for six hours and gives the same one for an hour, so a phone keeps it cached", async () => {
		const b = binding();
		let now = new Date("2026-10-26T00:00:00Z");
		const images = createHostedImages(b.binding, { now: () => now });
		const first = await images.url("img-1", "thumb");
		expect(await images.url("img-1", "thumb")).toBe(first);
		expect(await images.url("img-1", "large")).not.toBe(first);
		now = new Date(now.getTime() + 3_600_001);
		expect(await images.url("img-1", "thumb")).not.toBe(first);
		expect(b.calls.filter((c) => c.startsWith("sign"))).toEqual(["sign img-1/thumb for 21600s", "sign img-1/large for 21600s", "sign img-1/thumb for 21600s"]);
	});
	it("deleting one that's already gone is done, and lists every page of every team's images (the clean-up compares them with every team's records)", async () => {
		const b = binding();
		const images = createHostedImages(b.binding, { now: () => new Date() });
		for (let i = 0; i < 2; i++) await images.upload(new Uint8Array([i]), { teamId: "b12.1-2026", uploadedBy: 1, filename: "photo.jpg" });
		await b.binding.hosted.upload(new ArrayBuffer(1), { metadata: { teamId: "another-team" } });
		expect((await images.list()).map((i) => i.id)).toEqual(["img-1", "img-2", "img-3"]);
		expect(b.calls.filter((c) => c.startsWith("list"))).toEqual(["list undefined cursor=", "list undefined cursor=next"]);
		expect(await images.delete("img-1")).toBe("deleted");
		expect(await images.delete("img-1")).toBe("already_gone");
		expect(await images.bytes("img-1")).toBeNull();
	});
});
