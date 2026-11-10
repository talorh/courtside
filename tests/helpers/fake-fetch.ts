/** A fetch for platform client tests: records each call and answers with the replies in turn (the last one repeats).
 * A string body is sent as is, anything else as JSON, and no body as an empty reply. */
export function fakeFetch(...replies: Array<{ status?: number; body?: unknown }>) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		const r = (replies.length > 1 ? replies.shift() : replies[0]) ?? {};
		const body = r.body === undefined ? null : typeof r.body === "string" ? r.body : JSON.stringify(r.body);
		return new Response(body, { status: r.status ?? 200 });
	}) as unknown as typeof globalThis.fetch;
	return { calls, fetch };
}
