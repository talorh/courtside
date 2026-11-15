// The guard on every write: a write says which team its page was for, so nothing lands
// in a team other than the one the person was looking at. Forms carry `_team` (layout() adds it), page scripts send
// X-Courtside-Team (upload-net.js, ask.js).
import type { Viewer } from "../auth/viewer.ts";
import { teamLabel } from "../features/teams/team-code.ts";
import type { Team } from "../features/teams/team.ts";
import { adminCanOpen } from "./current-team.ts";
import { badRequest, HttpError } from "./errors.ts";

export interface WriteTeam { teamId: string; from: "page-script" | "form" }

/** The most a page's form sends (2 MB): well above the biggest, a fixture spreadsheet (300 KB and the form round it) or
 * its preview's games (100,000 characters, form-encoded). The routes' own, smaller limits still give their own words. */
export const MAX_FORM_BYTES = 2_000_000;

const tooBig = () => new HttpError(413, "too_big", "That's too big to send. Choose a smaller file.");

/** The team a write says it was made for: X-Courtside-Team (page scripts; the body is never read, so a photo isn't parsed
 * twice), else a form's `_team` field, read from a copy so the handler still gets the body. null when it names none. */
export async function writeTeam(req: Request): Promise<WriteTeam | null> {
	const header = req.headers.get("X-Courtside-Team");
	if (header) return { teamId: header, from: "page-script" };
	const type = req.headers.get("Content-Type") ?? "";
	if (!/form/i.test(type)) return null;
	// Refused before the copy is made, so a huge form is never held in memory twice.
	if (Number(req.headers.get("Content-Length") ?? 0) > MAX_FORM_BYTES) throw tooBig();
	const bytes = await readUpTo(req.clone(), MAX_FORM_BYTES);
	let form: FormData;
	try {
		form = await new Response(bytes, { headers: { "Content-Type": type } }).formData();
	} catch (err) {
		throw badRequest("Please send the form from the page.", err);
	}
	const team = form.get("_team");
	return typeof team === "string" && team !== "" ? { teamId: team, from: "form" } : null;
}

/** The whole body, or a 413 once it's past `max`: a body sent in chunks has no Content-Length to check first. */
async function readUpTo(req: Request, max: number): Promise<Uint8Array> {
	if (!req.body) return new Uint8Array();
	const reader = req.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		// No more is read, so no more arrives. Not cancelled: a copy's cancel waits for the original's, which nothing reads.
		if (size > max) throw tooBig();
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	chunks.reduce((at, c) => (bytes.set(c, at), at + c.byteLength), 0);
	return bytes;
}

/**
 * The team a write runs as. A form must be for the current team: one from a page of another team (switched in another
 * window since) is refused, and a reload shows where you are. A page script's write runs as its page's team whenever
 * the person can open it, so an upload, a batch of photos or a live stream carries on when they switch team in
 * another window. A write that names no team comes from a page from before the switchover.
 */
export async function teamForWrite(db: D1Database, viewer: Viewer, current: Team | "choose" | "none", says: WriteTeam | null): Promise<Team> {
	if (!says) throw new HttpError(409, "site_updated", "The site has been updated. Reload the page to carry on.");
	if (typeof current !== "string" && says.teamId === current.id) return current;
	if (says.from === "page-script") {
		const own = viewer.memberships.find((m) => m.team.id === says.teamId)?.team;
		const team = own ?? (viewer.isAdmin ? await adminCanOpen(db, viewer, says.teamId) : null);
		if (team) return team;
	}
	const where = typeof current === "string" ? "" : `You switched to ${teamLabel(current)} in another window. `;
	throw new HttpError(409, "team_changed", `${where}Reload this page to carry on.`);
}
