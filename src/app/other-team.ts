// A link to another of your teams' games, videos, clips or photos. Addresses don't name their team, so
// /games/12 opened while you're on Saints B12.1, for a game of Saints G14.5's, offers to switch rather than "not found".
// Someone who can't open that team gets the plain "not found": nothing says it exists. Only for reading: a write with
// another team's id is the 404 it always was.
import type { Viewer } from "../auth/viewer.ts";
import { type Owned, ownerTeamId } from "../features/teams/owner-repository.ts";
import { teamLabel } from "../features/teams/team-code.ts";
import type { Team } from "../features/teams/team.ts";
import { otherTeamPage } from "../ui/landing-pages.ts";
import { adminCanOpen } from "./current-team.ts";
import { htmlResponse, jsonError } from "./respond.ts";

const LINKS: Array<{ path: RegExp; kind: Owned; what: string }> = [
	{ path: /^\/games\/(\d+)$/, kind: "games", what: "game" },
	{ path: /^\/(?:api\/)?videos\/(\d+)\/download\/hd$/, kind: "videos", what: "video" },
	{ path: /^\/(?:api\/)?clips\/(\d+)\/download$/, kind: "clips", what: "clip" },
	{ path: /^\/photos\/(\d+)(?:\/download)?$/, kind: "photos", what: "photo" },
];

/** After a GET found nothing in the current team: the offer to switch when the id is another team's that the viewer
 * can open, else null (the usual "not found"). */
export async function otherTeam(db: D1Database, viewer: Viewer, current: Team, url: URL): Promise<Response | null> {
	for (const link of LINKS) {
		const m = link.path.exec(url.pathname);
		if (!m) continue;
		const owner = await ownerTeamId(db, link.kind, Number(m[1]));
		if (!owner || owner === current.id) return null;
		const team = viewer.memberships.find((x) => x.team.id === owner)?.team ?? (viewer.isAdmin ? await adminCanOpen(db, viewer, owner) : null);
		if (!team) return null;
		const said = `This ${link.what} is in ${teamLabel(team)}.`;
		if (url.pathname.startsWith("/api/")) return jsonError(409, "other_team", `${said} Switch to ${teamLabel(team)} to open it.`);
		return htmlResponse(otherTeamPage({ team, said, next: url.pathname + url.search }));
	}
	return null;
}
