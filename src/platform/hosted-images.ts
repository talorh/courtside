// Photos are kept in Cloudflare Images (Courtside's Images and Stream bundle), through the Worker's Images
// binding: no API token, and Cloudflare signs the links. Every photo is private (requireSignedURLs); pages show its
// variants through signed links that run out. The variants (infra/images-variant-*.json) strip all metadata.
import { siteLabel, siteOf } from "./site-label.ts";

export type PhotoVariant = "thumb" | "large";

export interface ImagesPort {
	/** Stores the JPEG (checked and stripped already) as a private image named `filename`. Its Images id. */
	upload(bytes: Uint8Array, o: { teamId: string; uploadedBy: number; filename: string }): Promise<string>;
	/** A signed link to the variant: good for six hours, and the same link for an hour (so phones keep it cached). */
	url(imageId: string, variant: PhotoVariant): Promise<string>;
	/** The stored JPEG, or null once Images no longer has it. */
	bytes(imageId: string): Promise<ReadableStream<Uint8Array> | null>;
	/** Deleting one Images no longer has is done. */
	delete(imageId: string): Promise<"deleted" | "already_gone">;
	/** Every image in the account: every team's photos, and staging's (`site`), for the nightly clean-up. */
	list(): Promise<Array<{ id: string; uploaded: string; site: string | null }>>;
}

const LINK_SECONDS = 6 * 3600;
const REUSE_MS = 3_600_000;

// The runtime's Symbol.dispose (the project's TypeScript library list stops short of it).
const DISPOSE = (Symbol as unknown as { dispose?: symbol }).dispose;
/** Each image's handle is a connection to Images, closed once it's used: left open, the runtime closes it later and
 * warns ("An RPC stub was not disposed properly"). */
const close = (image: ImageHandle) => {
	const dispose = DISPOSE ? (image as unknown as Record<symbol, unknown>)[DISPOSE] : undefined;
	if (typeof dispose === "function") dispose.call(image);
};

/** Signed links by image and variant, kept for the Worker instance's life (src/index.ts), as Stream tokens are. */
export type ImageUrlCache = Map<string, { url: string; until: number }>;
export const newImageUrlCache = (): ImageUrlCache => new Map();

/** `site`: "staging" on staging, which labels its photos (the account's Images is shared with the live site). */
export function createHostedImages(images: ImagesBinding, o: { now: () => Date; cache?: ImageUrlCache; site?: string | null }): ImagesPort {
	const cache = o.cache ?? newImageUrlCache();
	const withImage = async <T>(imageId: string, use: (image: ImageHandle) => Promise<T>): Promise<T> => {
		const image = images.hosted.image(imageId);
		try {
			return await use(image);
		} finally {
			close(image);
		}
	};
	return {
		async upload(bytes, { teamId, uploadedBy, filename }) {
			const image = await images.hosted.upload(bytes.slice().buffer, { filename, requireSignedURLs: true, metadata: { teamId, ...siteLabel(o.site) }, creator: String(uploadedBy) });
			return image.id;
		},
		async url(imageId, variant) {
			const key = `${imageId}/${variant}`, now = o.now().getTime();
			const kept = cache.get(key);
			if (kept && kept.until > now) return kept.url;
			const url = await withImage(imageId, (image) => image.signedUrl({ variant, expiresIn: LINK_SECONDS }));
			for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
			cache.set(key, { url, until: now + REUSE_MS });
			return url;
		},
		// The bytes come through the handle, so it's closed once they've all been read (or the reading stops).
		async bytes(imageId) {
			const image = images.hosted.image(imageId);
			const stream = await image.bytes().catch((err: unknown) => { close(image); throw err; });
			if (!stream) return (close(image), null);
			return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ flush: () => close(image), cancel: () => close(image) }));
		},
		async delete(imageId) {
			return (await withImage(imageId, (image) => image.delete())) ? "deleted" : "already_gone";
		},
		async list() {
			const all: Array<{ id: string; uploaded: string; site: string | null }> = [];
			let cursor: string | undefined;
			do {
				const page = await images.hosted.list({ limit: 100, cursor });
				all.push(...page.images.map((i) => ({ id: i.id, uploaded: i.uploaded ?? "", site: siteOf(i.meta) })));
				cursor = page.listComplete ? undefined : page.cursor;
			} while (cursor);
			return all;
		},
	};
}
