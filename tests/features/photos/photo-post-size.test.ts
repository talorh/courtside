import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES } from "../../../src/features/photos/photos-service.ts";
import { makeClient } from "../../helpers/app.ts";
import { B12_1, createTestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";

// A photo's post with no Content-Length to check first (sent in chunks): read only up to the photo limit, not whole.

const CHUNK = 65_536;

/** The phone's post (photos.js) as a stream with no Content-Length: the form's bytes, then `extra` bytes more of photo. */
function chunked(photo: Uint8Array, extra = 0) {
	const head = new TextEncoder().encode('--b\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
	const tail = new TextEncoder().encode('\r\n--b\r\nContent-Disposition: form-data; name="takenAt"\r\n\r\n\r\n--b--\r\n');
	// Padding goes inside the photo's part, so the whole form is one too-big photo.
	const pieces = [head, photo, ...Array.from({ length: Math.ceil(extra / CHUNK) }, () => new Uint8Array(CHUNK)), tail];
	let sent = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(c) {
			const next = pieces.shift();
			if (!next) return c.close();
			sent += next.byteLength;
			c.enqueue(next);
		},
	});
	const init = { method: "POST", body, duplex: "half", headers: { "X-Courtside-Team": B12_1.id, "Content-Type": "multipart/form-data; boundary=b" } } as RequestInit;
	return { init, sent: () => sent };
}

describe("a photo sent with no Content-Length", () => {
	it("is refused once it's past the photo limit, with the photo's own words, and nothing past that is read", async () => {
		const deps = createTestDeps();
		const post = chunked(testJpeg(), 3 * MAX_PHOTO_BYTES);
		const res = await makeClient(deps)("/api/photos", post.init);
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ ok: false, error: { code: "too_big", message: "That photo is too big to add (10 MB at most)." } });
		expect(post.sent()).toBeLessThan(MAX_PHOTO_BYTES + 64 * 1024 + 4 * CHUNK);
		expect(deps.images.stored.size).toBe(0);
	});
	it("is added as ever when it's within the limit", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps)("/api/photos", chunked(testJpeg()).init);
		expect(res.status).toBe(201);
		expect(deps.images.stored.size).toBe(1);
	});
});
