import { exportJWK, generateKeyPair, jwtVerify, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { createR2Originals } from "../../src/platform/r2-originals.ts";
import { createPresigner } from "../../src/platform/r2-presigner.ts";
import { createStreamClient } from "../../src/platform/stream-client.ts";
import { createTokenSigner, hdDownloadUrl, playerUrl } from "../../src/platform/stream-tokens.ts";
import { fakeFetch } from "../helpers/fake-fetch.ts";

describe("stream tokens", () => {
	it("signs RS256 tokens Stream accepts", async () => {
		const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
		const jwk = btoa(JSON.stringify({ ...(await exportJWK(privateKey)), alg: "RS256" }));
		const signer = createTokenSigner({ keyId: "key-1", jwkBase64: jwk, now: () => new Date() });
		const token = await signer.sign("uid-9", { downloadable: true, ttlSeconds: 60 });
		const { payload } = await jwtVerify(token, publicKey);
		expect(payload).toMatchObject({ sub: "uid-9", kid: "key-1", downloadable: true });
		expect(decodeProtectedHeader(token).kid).toBe("key-1");
		expect(playerUrl("abc", "T")).toBe("https://customer-abc.cloudflarestream.com/T/iframe");
		expect(hdDownloadUrl("abc", "T", "rd 8.mp4")).toBe("https://customer-abc.cloudflarestream.com/T/downloads/default.mp4?filename=rd%208.mp4");
	});
});

describe("stream token reuse", () => {
	it("reuses a plain token for an hour (Watch games signs one per game), never a download one", async () => {
		const { privateKey } = await generateKeyPair("RS256", { extractable: true });
		const jwk = btoa(JSON.stringify({ ...(await exportJWK(privateKey)), alg: "RS256" }));
		let t = Date.parse("2026-10-17T00:00:00Z");
		const signer = createTokenSigner({ keyId: "k", jwkBase64: jwk, now: () => new Date(t) });
		const first = await signer.sign("uid-1");
		t += 1000;
		expect(await signer.sign("uid-1")).toBe(first);
		expect(await signer.sign("uid-2")).not.toBe(first);
		expect(await signer.sign("uid-1", { downloadable: true })).not.toBe(first);
		t += 3600 * 1000;
		expect(await signer.sign("uid-1")).not.toBe(first);
	});
});

describe("r2 presigner", () => {
	it("pre-signs part uploads and downloads", async () => {
		const p = createPresigner({ accountId: "acct", bucket: "courtside-originals", accessKeyId: "AK", secretAccessKey: "SK" });
		const put = new URL(await p.partUrl("originals/t/u/game.mov", "up-1", 3));
		expect(put.host).toBe("acct.r2.cloudflarestorage.com");
		expect(put.pathname).toBe("/courtside-originals/originals/t/u/game.mov");
		expect(put.searchParams.get("partNumber")).toBe("3");
		expect(put.searchParams.get("X-Amz-Signature")).toBeTruthy();
		const get = new URL(await p.getUrl("originals/t/u/game.mov", { ttlSeconds: 3600, downloadName: 'a"b.mov' }));
		expect(get.searchParams.get("X-Amz-Expires")).toBe("3600");
		expect(get.searchParams.get("response-content-disposition")).toBe('attachment; filename="ab.mov"');
	});
});

describe("r2 list of an upload's parts", () => {
	// Shaped like R2's real ListParts replies (checked against the bucket on 22 Oct 2026: ETag comes first, quoted).
	const part = (n: number) => `<Part><ETag>&quot;e${n}&quot;</ETag><LastModified>2026-10-22T08:5${n}:13.604Z</LastModified><PartNumber>${n}</PartNumber><Size>8388608</Size></Part>`;
	const page = (parts: number[], next: number | null) => `<?xml version="1.0" encoding="UTF-8"?><ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Bucket>courtside-originals</Bucket><Key>originals/t/u/live.mp4</Key><UploadId>up</UploadId><PartNumberMarker>0</PartNumberMarker>
<NextPartNumberMarker>${next ?? parts.at(-1)}</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>${next !== null}</IsTruncated>${parts.map(part).join("")}</ListPartsResult>`;
	const presigner = (...replies: Parameters<typeof fakeFetch>) => {
		const { calls, fetch } = fakeFetch(...replies);
		return { calls, p: createPresigner({ accountId: "acct", bucket: "courtside-originals", accessKeyId: "AK", secretAccessKey: "SK", fetch }) };
	};
	it("reads every page of parts, in order, with when each arrived", async () => {
		const { calls, p } = presigner({ body: page([1, 2], 2) }, { body: page([3], null) });
		expect(await p.listParts("originals/t/u/live.mp4", "up-1")).toEqual([1, 2, 3].map((n) => ({ partNumber: n, etag: `e${n}`, uploaded: `2026-10-22T08:5${n}:13.604Z` })));
		const first = new URL(new Request(calls[0]!.url as unknown as Request).url);
		expect(first.pathname).toBe("/courtside-originals/originals/t/u/live.mp4");
		expect(first.searchParams.get("uploadId")).toBe("up-1");
		expect(new URL(new Request(calls[1]!.url as unknown as Request).url).searchParams.get("part-number-marker")).toBe("2");
	});
	it("an upload R2 no longer has is null; any other failure throws with R2's code", async () => {
		expect(await presigner({ status: 404, body: "<Error><Code>NoSuchUpload</Code></Error>" }).p.listParts("k", "u")).toBeNull();
		await expect(presigner({ status: 403, body: "<Error><Code>AccessDenied</Code></Error>" }).p.listParts("k", "u")).rejects.toThrow("R2 list parts failed (403): AccessDenied");
	});
});

describe("stream client", () => {
	const streamClient = (...replies: Parameters<typeof fakeFetch>) => {
		const { calls, fetch } = fakeFetch(...replies);
		return { calls, client: createStreamClient({ accountId: "sa", apiToken: "t", fetch }) };
	};

	it("copies an upload into the Stream account as a signed-only video", async () => {
		const { calls, client } = streamClient({ status: 200, body: { success: true, result: { uid: "v1" } } });
		expect(await client.uploadFromUrl("https://r2/x", { scheduledDeletion: "2028-01-01T00:00:00Z", meta: { name: "Game" } })).toBe("v1");
		expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/sa/stream/copy");
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ url: "https://r2/x", requireSignedURLs: true, scheduledDeletion: "2028-01-01T00:00:00Z", meta: { name: "Game" } });
		expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer t");
	});

	it("maps details and downloads, and treats a missing video as gone (no details; already deleted)", async () => {
		const { client } = streamClient(
			{ status: 200, body: { success: true, result: { readyToStream: true, status: { state: "ready", errorReasonCode: "", errorReasonText: "" }, duration: 61.4 } } },
			{ status: 200, body: { success: true, result: { default: { status: "ready" } } } },
			{ status: 404, body: { success: false } },
			{ status: 200 },
			{ status: 404, body: { success: false, errors: [{ message: "not found" }] } },
			{ status: 500, body: { success: false, errors: [{ message: "boom" }] } },
			{ status: 404, body: { success: false, errors: [{ message: "not found" }] } },
		);
		expect(await client.details("u1")).toEqual({ readyToStream: true, state: "ready", errorReason: "", durationSeconds: 61 });
		expect(await client.downloadStatus("u1")).toBe("ready");
		expect(await client.downloadStatus("u2")).toBe("none");
		expect(await client.deleteVideo("u1")).toBe("deleted");
		expect(await client.deleteVideo("missing")).toBe("already_gone");
		await expect(client.details("u3")).rejects.toThrow("boom");
		expect(await client.details("gone")).toBeNull();
	});

	it("lists every video, page by page: a full page of 1,000 means more before the oldest listed", async () => {
		const video = (n: number) => ({ uid: `v${n}`, created: `2026-10-${String(1 + (n % 28)).padStart(2, "0")}T00:00:00.000Z`, meta: n % 2 ? { site: "staging" } : {} });
		const first = Array.from({ length: 1000 }, (_, i) => video(1000 - i));
		const { calls, client } = streamClient({ status: 200, body: { success: true, result: first } }, { status: 200, body: { success: true, result: [video(0), { uid: "v1000", created: first[0]!.created }] } });
		const listed = await client.listVideos();
		expect(calls.map((c) => c.url)).toEqual(["https://api.cloudflare.com/client/v4/accounts/sa/stream", `https://api.cloudflare.com/client/v4/accounts/sa/stream?before=${encodeURIComponent(first.at(-1)!.created)}`]);
		expect(listed).toHaveLength(1001);
		expect(listed.filter((v) => v.site === "staging")).toHaveLength(500);
	});

	it("reports the status when Stream answers with an error page instead of JSON, and never waits forever", async () => {
		const { calls, client } = streamClient({ status: 502, body: "<html>Bad gateway</html>" });
		await expect(client.details("u1")).rejects.toThrow("Stream GET u1 failed (502): the reply wasn't JSON");
		expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
	});
});

describe("r2 originals", () => {
	const bucketWhoseAbort = (err: Error) => ({ resumeMultipartUpload: () => ({ abort: () => Promise.reject(err) }) }) as unknown as R2Bucket;
	it("cancelling an upload R2 already dropped (after 7 days) is done; any other failure throws", async () => {
		const gone = new Error("abortMultipartUpload: The specified multipart upload does not exist. (10024)");
		await expect(createR2Originals(bucketWhoseAbort(gone)).abort("k", "u")).resolves.toBeUndefined();
		await expect(createR2Originals(bucketWhoseAbort(new Error("internal error (10001)"))).abort("k", "u")).rejects.toThrow("10001");
	});
});
