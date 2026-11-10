import { AwsClient } from "aws4fetch";
import type { UploadedPart } from "./r2-originals.ts";

/** A part R2 already holds for an unfinished upload, and when it arrived. */
export interface StoredPart extends UploadedPart {
	uploaded: string;
}

export interface Presigner {
	partUrl(key: string, uploadId: string, partNumber: number): Promise<string>;
	getUrl(key: string, options: { ttlSeconds: number; downloadName?: string }): Promise<string>;
	/** A link to write one whole object (the joiner's joined file). */
	putUrl(key: string, ttlSeconds: number): Promise<string>;
	/** The parts that reached R2 so far, in order (R2's own list, from its S3 API); null once R2 no longer has the upload. */
	listParts(key: string, uploadId: string): Promise<StoredPart[] | null>;
}

const UPLOAD_TTL_SECONDS = 6 * 3600;

interface PresignerConfig {
	accountId: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	fetch?: typeof fetch;
}

/** One value from an XML element, e.g. <PartNumber>3</PartNumber>; S3 quotes ETags (&quot;), which are dropped. */
const field = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]?.replace(/&quot;|"/g, "");

/** R2 through its S3 API (aws4fetch): signed links the browser uses directly, and reading an upload's parts. */
export function createPresigner(config: PresignerConfig): Presigner {
	const doFetch = config.fetch ?? fetch;
	const client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto" });
	const base = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
	const objectUrl = (key: string, query: Record<string, string>) => {
		const url = new URL(`${base}/${key.split("/").map(encodeURIComponent).join("/")}`);
		for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
		return url;
	};

	async function presign(method: string, key: string, query: Record<string, string>, ttlSeconds: number) {
		const url = objectUrl(key, { ...query, "X-Amz-Expires": String(ttlSeconds) });
		const signed = await client.sign(new Request(url, { method }), { aws: { signQuery: true } });
		return signed.url;
	}

	return {
		partUrl: (key, uploadId, partNumber) => presign("PUT", key, { partNumber: String(partNumber), uploadId }, UPLOAD_TTL_SECONDS),
		putUrl: (key, ttlSeconds) => presign("PUT", key, {}, ttlSeconds),
		getUrl: (key, options) => {
			const name = options.downloadName?.replace(/["\\]/g, "");
			const query: Record<string, string> = name ? { "response-content-disposition": `attachment; filename="${name}"` } : {};
			return presign("GET", key, query, options.ttlSeconds);
		},
		async listParts(key, uploadId) {
			const parts: StoredPart[] = [];
			for (let marker = "0"; ;) {
				const url = objectUrl(key, { uploadId, "max-parts": "1000", "part-number-marker": marker });
				const res = await doFetch(await client.sign(new Request(url)), { signal: AbortSignal.timeout(15_000) });
				const xml = await res.text();
				if (res.status === 404) return null;
				if (!res.ok) throw new Error(`R2 list parts failed (${res.status}): ${field(xml, "Code") ?? "no details"}`);
				for (const [, part = ""] of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
					const partNumber = Number(field(part, "PartNumber")), etag = field(part, "ETag"), uploaded = field(part, "LastModified");
					if (partNumber > 0 && etag && uploaded) parts.push({ partNumber, etag, uploaded });
				}
				const next = field(xml, "NextPartNumberMarker");
				if (field(xml, "IsTruncated") !== "true" || !next || next === marker) return parts.sort((a, b) => a.partNumber - b.partNumber);
				marker = next;
			}
		},
	};
}
