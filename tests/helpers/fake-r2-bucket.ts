/**
 * Just enough of an R2 bucket binding for createR2Originals' listing and deleting: objects by key, listed `pageSize` at a
 * time. R2 can answer a list with fewer objects than its limit while more remain (truncated, with a cursor), and so does
 * this, so code that stops at a short page leaves objects behind.
 */
export class FakeR2Bucket {
	objects = new Map<string, { size: number; custom: Record<string, string> }>();
	lists: Array<{ prefix?: string; cursor?: string; include?: string[] }> = [];
	deleted: string[] = [];
	aborted: string[] = [];
	constructor(private readonly pageSize = 2) {}
	add(key: string, custom: Record<string, string> = {}) { this.objects.set(key, { size: 1, custom }); }
	async list(o: { prefix?: string; cursor?: string; include?: string[] } = {}) {
		this.lists.push(o);
		const keys = [...this.objects.keys()].filter((k) => k.startsWith(o.prefix ?? "")).sort();
		const start = o.cursor ? Number(o.cursor) : 0;
		const page = keys.slice(start, start + this.pageSize);
		const objects = page.map((key) => ({ key, size: this.objects.get(key)!.size, uploaded: new Date("2026-10-14T00:00:00Z"), customMetadata: this.objects.get(key)!.custom }));
		const end = start + page.length;
		return end < keys.length ? { objects, truncated: true, cursor: String(end), delimitedPrefixes: [] } : { objects, truncated: false, delimitedPrefixes: [] };
	}
	async delete(key: string) { this.deleted.push(key); this.objects.delete(key); }
	resumeMultipartUpload(key: string) { return { abort: async () => { this.aborted.push(key); } }; }
	asBinding() { return this as unknown as R2Bucket; }
}
