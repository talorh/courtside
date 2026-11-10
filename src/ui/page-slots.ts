// Parts of a team page worked out alongside it and put in places the layout leaves: the live bar at the top of every
// team page (features/live/live-bar.ts), and a team manager's alert, the PlayHQ fixture that couldn't be read
// (features/games/playhq-alert.ts). Video storage isn't an alert here: the site's admins get an email about it.
import type { SafeHtml } from "../shared/html.ts";

export const LIVE_SLOT = "<!--live-->";
/** On a team manager's pages only. */
export const ALERTS_SLOT = "<!--alerts-->";

/** Fills each slot on an HTML page, read once; any other response passes through untouched. Each `pending` was started
 * before the page was built, so they run side by side, and never rejects. */
export async function fillSlots(req: Request, response: Response, fills: Array<[slot: string, pending: Promise<SafeHtml | "">]>): Promise<Response> {
	const isPage = req.method === "GET" && response.status === 200 && response.headers.get("Content-Type")?.startsWith("text/html");
	if (!isPage || !fills.length) return response;
	let page = await response.text();
	for (const [slot, pending] of fills) {
		const part = await pending;
		page = page.replace(slot, () => (part ? part.__html : ""));
	}
	return new Response(page, { status: response.status, headers: response.headers });
}
