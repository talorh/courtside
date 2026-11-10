export interface UploadedPart {
	partNumber: number;
	etag: string;
}

/** Multipart lifecycle for originals. Part bodies go browser → R2 directly via pre-signed URLs. */
export interface OriginalsPort {
	createMultipart(key: string, contentType: string): Promise<string>;
	complete(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
	/** Done already if R2 no longer has the upload (finished, cancelled, or dropped after 7 days). */
	abort(key: string, uploadId: string): Promise<void>;
	remove(key: string): Promise<void>;
	/** Whether the whole object is there (a finished upload). */
	exists(key: string): Promise<boolean>;
	/** Small whole-object writes (the nightly database backup). `sha256` (hex): R2 refuses the write if the bytes differ. */
	put(key: string, body: string, contentType: string, o?: { sha256?: string; custom?: Record<string, string> }): Promise<void>;
	/** The objects under a prefix, newest last (backups are named by date), with their custom metadata. */
	list(prefix: string): Promise<StoredObject[]>;
}

export interface StoredObject {
	key: string;
	size: number;
	uploaded: string;
	custom: Record<string, string>;
}

// R2 drops an unfinished upload by itself after 7 days (r2-lifecycle.json), and another request can finish or cancel
// it: cancelling one that's already gone is done. R2's error for that is NoSuchUpload, code 10024 (R2 error codes).
const uploadGone = (err: unknown) => /\b10024\b|NoSuchUpload|upload does not exist/i.test(String(err));

export function createR2Originals(bucket: R2Bucket): OriginalsPort {
	return {
		async createMultipart(key, contentType) {
			const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType } });
			return upload.uploadId;
		},
		async complete(key, uploadId, parts) {
			await bucket.resumeMultipartUpload(key, uploadId).complete(parts);
		},
		async abort(key, uploadId) {
			await bucket.resumeMultipartUpload(key, uploadId).abort().catch((err: unknown) => {
				if (!uploadGone(err)) throw err;
			});
		},
		async remove(key) {
			await bucket.delete(key);
		},
		async exists(key) {
			return (await bucket.head(key)) !== null;
		},
		async put(key, body, contentType, o = {}) {
			await bucket.put(key, body, { httpMetadata: { contentType }, customMetadata: o.custom, ...(o.sha256 ? { sha256: o.sha256 } : {}) });
		},
		async list(prefix) {
			const listed = await bucket.list({ prefix, include: ["customMetadata"] });
			return listed.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString(), custom: o.customMetadata ?? {} }))
				.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); // names hold the date: plain order
		},
	};
}
