import { hasRole, type Role } from "../../src/auth/permissions.ts";
import type { Seeded } from "../helpers/two-teams.ts";

/** A request made with one team's ids (`s`), by a member of `own`'s team. */
export interface Req { path: string; init?: RequestInit }

export interface RouteCase {
	/** As the router lists it: "GET /games/:id". */
	route: string;
	/** The request with team `s`'s ids; `own` is the current team's (for a write that mixes them). */
	req: (s: Seeded, own: Seeded) => Req;
	/** Who makes the write (default: the team manager). */
	as?: Role;
	/** No ids of a team: it can only ever act on the current team. */
	ownOnly?: boolean;
	/** The answer to another team's ids, when it isn't 404. */
	foreign?: number;
	/** A page only its owner opens (a ticket is its asker's, the team manager's in the seed): anyone else's answer is "not
	 * found", as tests/features/support/support.test.ts checks. */
	owner?: Role;
}

/** Whether `role` opens this page (its least role `least`, from the router), as the crawling tests open each one. */
export const opens = (role: Role, r: RouteCase, least: Role) => hasRole(role, least) && (!r.owner || r.owner === role);

const form = (data: Record<string, string>): RequestInit => ({ method: "POST", body: new URLSearchParams(data) });
const familiesForm = (surname: string): RequestInit => form({ surname });
const json = (data: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
const game = { date: "2026-11-01", hour: "9", minute: "0", period: "am", competition: "VJBL", roundLabel: "12", opponent: "Lakeside", venue: "", video: "record" };
const get = (route: string, path: (s: Seeded) => string, more: Partial<RouteCase> = {}): RouteCase => ({ route: `GET ${route}`, req: (s) => ({ path: path(s) }), ...more });
const post = (route: string, path: (s: Seeded, own: Seeded) => string, init: (s: Seeded, own: Seeded) => RequestInit = () => form({}), more: Partial<RouteCase> = {}): RouteCase =>
	({ route: `POST ${route}`, req: (s, own) => ({ path: path(s, own), init: init(s, own) }), ...more });

/** Every route the site has. tests/isolation/posts.test.ts fails if the router has one that isn't here. */
export const ROUTES: RouteCase[] = [
	get("/", () => "/"), get("/upload", () => "/upload"), get("/live", (s) => `/live?game=${s.gameId}`, { foreign: 200 }),
	get("/games", () => "/games"), get("/games/:id", (s) => `/games/${s.gameId}`),
	get("/videos/:id/download/hd", (s) => `/videos/${s.videoId}/download/hd`), get("/api/videos/:id/download/hd", (s) => `/api/videos/${s.videoId}/download/hd`),
	get("/clips/:id/download", (s) => `/clips/${s.clipId}/download`), get("/api/clips/:id/download", (s) => `/api/clips/${s.clipId}/download`),
	get("/photos", () => "/photos"), get("/photos/:id", (s) => `/photos/${s.photoId}`), get("/photos/:id/download", (s) => `/photos/${s.photoId}/download`),
	get("/photos/download", (s) => `/photos/download?id=${s.photoId}`),
	get("/fixture/sample.csv", () => "/fixture/sample.csv"), get("/members/sample.csv", () => "/members/sample.csv"), get("/fixture", () => "/fixture"), get("/manage", () => "/manage"), get("/manage/game-lines", () => "/manage/game-lines"), get("/members", () => "/members"),
	get("/notifications", () => "/notifications"), get("/help", () => "/help"), get("/faq", () => "/faq"), get("/support", () => "/support"), get("/support/:id", (s) => `/support/${s.supportId}`, { owner: "manager" }),
	get("/roster", () => "/roster"), get("/roster/export.xlsx", () => "/roster/export.xlsx"),
	get("/roster/week/:week/message", (s) => `/roster/week/${s.week}/message`, { foreign: 200 }),

	post("/api/uploads", () => "/api/uploads", (s) => json({ gameId: s.gameId, fileName: "g.mov", fileSize: 1000, contentType: "video/quicktime" })),
	post("/api/uploads/:id/part-urls", (s) => `/api/uploads/${s.videoId}/part-urls`, () => json({ partNumbers: [1] })),
	post("/api/uploads/:id/complete", (s) => `/api/uploads/${s.videoId}/complete`, () => json({ parts: [{ partNumber: 1, etag: "e" }] })),
	post("/api/uploads/:id/abort", (s) => `/api/uploads/${s.videoId}/abort`, () => json({})),
	post("/videos/:id/keep-first", (s) => `/videos/${s.videoId}/keep-first`, () => form({ confirm: "yes" })),
	post("/api/live/:gameId/browser", (s) => `/api/live/${s.gameId}/browser`, () => json({ mimeType: "video/mp4" })),
	post("/api/live/:gameId/save", (s) => `/api/live/${s.gameId}/save`, () => json({})),
	post("/api/live/:gameId/continue", (s) => `/api/live/${s.gameId}/continue`, (s) => json({ videoId: s.videoId, mimeType: "video/mp4" })),
	post("/api/live/:gameId/end", (s) => `/api/live/${s.gameId}/end`, () => json({})),
	post("/live/:gameId/app", (s) => `/live/${s.gameId}/app`), post("/live/:gameId/camera", (s) => `/live/${s.gameId}/camera`),
	post("/live/:gameId/app-stop", (s) => `/live/${s.gameId}/app-stop`, () => form({ confirm: "yes" })),
	post("/api/live/:gameId/app-status", (s) => `/api/live/${s.gameId}/app-status`, () => json({})),
	// Only writes a log line (what the Go live page saw), with the current team's id: nothing to refuse.
	post("/api/live/:gameId/events", (s) => `/api/live/${s.gameId}/events`, () => json({ events: [{ s: 0, what: "x", p: true }] }), { foreign: 200 }),
	// Only writes a problem line, with the current team's id: another team's game is named as no game.
	post("/api/problems", () => "/api/problems", (s) => json({ what: "upload", gameId: s.gameId, message: "x" }), { foreign: 200 }),
	post("/videos/:id/move", (s) => `/videos/${s.videoId}/move`, (_s, own) => form({ gameId: String(own.gameId) })),
	post("/videos/:id/move", (_s, own) => `/videos/${own.videoId}/move`, (s) => form({ gameId: String(s.gameId) })),
	post("/videos/:id/delete", (s) => `/videos/${s.videoId}/delete`, () => form({ confirm: "yes" })),
	post("/videos/:id/clips", (s) => `/videos/${s.videoId}/clips`, () => form({ start: "0:10", end: "0:20", label: "x" })),
	post("/clips/:id/delete", (s) => `/clips/${s.clipId}/delete`, () => form({ confirm: "yes" })),
	post("/clips/:id/players", (s) => `/clips/${s.clipId}/players`, (_s, own) => form({ players: String(own.playerId) })),
	post("/clips/:id/players", (_s, own) => `/clips/${own.clipId}/players`, (s) => form({ players: String(s.playerId) }), { foreign: 400 }),
	post("/clips/:id/removal-requests", (s) => `/clips/${s.clipId}/removal-requests`, () => form({ reason: "x" })),
	post("/clip-removal-requests/:id/delete-clip", (s) => `/clip-removal-requests/${s.clipRemovalId}/delete-clip`, () => form({ confirm: "yes" })),
	post("/clip-removal-requests/:id/keep", (s) => `/clip-removal-requests/${s.clipRemovalId}/keep`, () => form({ note: "" })),
	get("/games/:id/notes.xlsx", (s) => `/games/${s.gameId}/notes.xlsx`, { owner: "coach" }),
	post("/games/:id/notes", (s) => `/games/${s.gameId}/notes`, () => form({ at: "1:00", body: "n" }), { as: "coach" }),
	post("/notes/:id/delete", (s) => `/notes/${s.noteId}/delete`, () => form({ confirm: "yes" }), { as: "coach" }),
	post("/me/scores", () => "/me/scores", () => form({ hide: "1", back: "/games" }), { ownOnly: true }),
	post("/manage/game-lines", () => "/manage/game-lines", () => form({}), { ownOnly: true }),
	post("/games/:id/score", (s) => `/games/${s.gameId}/score`, () => form({ ours: "50", opponent: "40" })),
	post("/games/:id/score/clear", (s) => `/games/${s.gameId}/score/clear`),
	post("/games/:id/favourite", (s) => `/games/${s.gameId}/favourite`, () => form({ on: "1", back: "/games" })),
	post("/clips/:id/favourite", (s) => `/clips/${s.clipId}/favourite`, () => form({ on: "1", back: "/games" })),
	post("/api/photos", () => "/api/photos", () => ({ method: "POST", body: new FormData() }), { ownOnly: true }),
	post("/photos/:id/delete", (s) => `/photos/${s.photoId}/delete`, () => form({ confirm: "yes" })),
	post("/photos/delete", () => "/photos/delete", (s) => form({ confirm: "yes", id: String(s.photoId) })),
	post("/photos/:id/removal-requests", (s) => `/photos/${s.photoId}/removal-requests`, () => form({ reason: "x" })),
	post("/photo-removal-requests/:id/delete-photo", (s) => `/photo-removal-requests/${s.photoRemovalId}/delete-photo`, () => form({ confirm: "yes" })),
	post("/photo-removal-requests/:id/keep", (s) => `/photo-removal-requests/${s.photoRemovalId}/keep`, () => form({ note: "" })),
	post("/fixture/playhq", () => "/fixture/playhq", (s) => form({ url: s.playhqUrl, competition: "VJBL" }), { ownOnly: true }),
	post("/fixture/playhq/:id/check", (s) => `/fixture/playhq/${s.fixtureId}/check`),
	post("/fixture/playhq/:id/no-video", (s) => `/fixture/playhq/${s.fixtureId}/no-video`),
	post("/fixture/playhq/:id/video", (s) => `/fixture/playhq/${s.fixtureId}/video`),
	post("/fixture/playhq/:id/remove", (s) => `/fixture/playhq/${s.fixtureId}/remove`, () => form({ confirm: "yes" })),
	post("/fixture/link", () => "/fixture/link", () => form({ url: "https://example.com/fixture", competition: "VJBL" }), { ownOnly: true }),
	post("/fixture/sheet", () => "/fixture/sheet", () => ({ method: "POST", body: new FormData() }), { ownOnly: true }),
	post("/fixture/import", () => "/fixture/import", () => form({}), { ownOnly: true }),
	post("/fixture", () => "/fixture", () => form(game), { ownOnly: true }),
	post("/fixture/:id", (s) => `/fixture/${s.gameId}`, () => form(game)),
	post("/fixture/:id/delete", (s) => `/fixture/${s.gameId}/delete`, () => form({ confirm: "yes" })),
	post("/fixture/:id/delete-all", (s) => `/fixture/${s.gameId}/delete-all`, () => form({ confirm: "yes" })),
	post("/members", () => "/members", (s) => form({ email: s.emails.watcher, name: "", role: "watcher" }), { ownOnly: true }),
	post("/members/sheet", () => "/members/sheet", () => ({ method: "POST", body: new FormData() }), { ownOnly: true }),
	post("/members/import", () => "/members/import", (s) => form({ people: JSON.stringify([{ email: s.emails.watcher, name: "", role: "watcher" }]) }), { ownOnly: true }),
	post("/members/:id", (s) => `/members/${s.members.watcher}`, () => form({ name: "x", role: "watcher" })),
	post("/members/:id/remove", (s) => `/members/${s.members.watcher}/remove`, () => form({ confirm: "yes" })),
	post("/members/:id/sign-in", (s) => `/members/${s.members.watcher}/sign-in`, () => form({})),
	post("/season-pack/hd", () => "/season-pack/hd", () => form({}), { ownOnly: true }),
	post("/players", () => "/players", () => form({ number: "42", name: "Newkid" }), { ownOnly: true }),
	post("/players/:id", (s) => `/players/${s.playerId}`, () => form({ number: "43", name: "Changed" })),
	post("/players/:id/remove", (s) => `/players/${s.playerId}/remove`, () => form({ confirm: "yes" })),
	post("/videos/:id/removal-requests", (s) => `/videos/${s.videoId}/removal-requests`, () => form({ reason: "x" })),
	post("/removal-requests/:id/delete-video", (s) => `/removal-requests/${s.removalId}/delete-video`, () => form({ confirm: "yes" })),
	post("/removal-requests/:id/keep", (s) => `/removal-requests/${s.removalId}/keep`, () => form({ note: "" })),
	post("/api/ask", () => "/api/ask", () => json({ question: "When is the next game?" }), { ownOnly: true }),
	post("/support", () => "/support", () => form({ topic: "other", message: "Help", contact: "x" }), { ownOnly: true }),
	post("/support/:id/reply", (s) => `/support/${s.supportId}/reply`, () => form({ body: "And another thing" })),
	post("/roster/families", () => "/roster/families", () => familiesForm("Newfamily"), { ownOnly: true }),
	post("/roster/families/:id/remove", (s) => `/roster/families/${s.familyId}/remove`, () => form({ confirm: "yes" })),
	post("/roster/generate", () => "/roster/generate", () => form({}), { ownOnly: true }),
	post("/roster/duties", () => "/roster/duties", () => form({ video: "1" }), { ownOnly: true }),
	post("/roster/week/:week", (s) => `/roster/week/${s.week}`, (s) => form({ [`scoring1g${s.gameId}`]: String(s.familyId), [`scoring2g${s.gameId}`]: "", [`lollies1g${s.gameId}`]: "", [`video1g${s.gameId}`]: "" }), { foreign: 400 }),
	post("/roster/week/:week/no-video", (s) => `/roster/week/${s.week}/no-video`, () => form({}), { ownOnly: true }),
	post("/roster/week/:week/video", (s) => `/roster/week/${s.week}/video`, () => form({}), { ownOnly: true }),
	post("/roster/week/:week/scorers-only", (s) => `/roster/week/${s.week}/scorers-only`, () => form({}), { ownOnly: true }),
	post("/roster/week/:week/all-duties", (s) => `/roster/week/${s.week}/all-duties`, () => form({}), { ownOnly: true }),
];
