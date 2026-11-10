// The files in public/ (Workers static assets), reached through the ASSETS binding since the Worker runs before them
// (every file needs the sign-in, so the Worker checks it first, then hands the request on). Thin, like every
// platform client.

export interface AssetsPort {
	/** The file at the request's path, with the headers public/_headers gives it; 404 when there's no such file. */
	fetch(req: Request): Promise<Response>;
}

export function createAssets(binding: Fetcher): AssetsPort {
	return {
		async fetch(req) {
			// A fetched response's headers can't be changed, and handle-request.ts sets the site's on every answer.
			const res = await binding.fetch(req);
			return new Response(res.body, res);
		},
	};
}
