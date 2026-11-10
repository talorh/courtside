// Staging (docs/runbooks/staging.md) says so at the top of every page, so it's never taken for the live site.

const STRIP = '<div class="stagingstrip" role="note"><b>Staging:</b> test data, not the live site.</div>';

/** `res` with the strip straight after `<body…>` when it's a page; anything else (JSON, files, redirects) as it came. */
export async function withStagingStrip(res: Response): Promise<Response> {
	if (!res.headers.get("Content-Type")?.startsWith("text/html")) return res;
	const page = (await res.text()).replace(/<body[^>]*>/, (tag) => tag + STRIP);
	return new Response(page, { status: res.status, headers: res.headers });
}
