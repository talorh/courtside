// Pages for the browser tests, rendered by the site's own views (src/), so the tests see the markup families get.
// Imported by Node (scripts/e2e.mjs), which strips the .ts views' types itself.
import { useExampleClub } from "../helpers/example-club.ts";
import { teamsListPage } from "../../src/features/admin/views/teams-page.ts";
import { helpFor } from "../../src/features/help/views/faq-item.ts";
import { helpPage } from "../../src/features/help/views/help-page.ts";
import { homePage } from "../../src/features/home/views/home-page.ts";
import { ALL_DUTIES } from "../../src/features/roster/roster-duties.ts";
import { livePage } from "../../src/features/live/views/live-page.ts";
import { photoPage as photoView } from "../../src/features/photos/views/photo-page.ts";
import { PHOTOS_MESSAGES, photosPage as photosView } from "../../src/features/photos/views/photos-page.ts";
import { livePlayer } from "../../src/features/videos/views/live-player.ts";
import { uploadPage } from "../../src/features/videos/views/upload-page.ts";
import { watchPage } from "../../src/features/videos/views/watch-page.ts";
import { html } from "../../src/shared/html.ts";
import { launchPage } from "../../src/ui/landing-pages.ts";
import { membersPage } from "../../src/features/members/views/members-page.ts";
import { signInPage } from "../../src/features/signin/views/signin-page.ts";
import { layout } from "../../src/ui/layout.ts";

useExampleClub();

export const GAME_ID = 7;

export const TEAM_ID = "b12.1-2026";
const team = { id: TEAM_ID, code: "b12.1", name: "Saints U12 Boys 12.1", seasonStart: 2026, askName: "Sam", status: "active", closedAt: null, deleteAfter: null };
/** What a page's layout shows for someone in one team (`<html data-team>` included, which page scripts send back). */
const member = (role) => ({
	team, viewer: { email: "filmer@example.com", isAdmin: false, memberships: [] }, viewAs: null,
	member: { id: 1, teamId: TEAM_ID, email: "filmer@example.com", name: "Test Filmer", role, lastSeenAt: null, hideScores: false, hidden: false },
});
const game = {
	id: GAME_ID, teamId: "b12.1-2026", startsAt: "2026-10-30T18:40", competition: "Practice match", roundLabel: "",
	opponent: "Northside 2", venue: "Saints Stadium, Court 1", noVideo: false, playhqGone: false, fromPlayhq: false, liveStream: true,
};

/** The Upload page with `count` games waiting for a video (game 7, the latest, picked), as someone set to Watch and film sees it. */
export function uploadTestPage(count) {
	const games = [game, { ...game, id: 8, startsAt: "2026-10-23T18:40", opponent: "Riverton" }].slice(0, count).map((g) => ({ game: g, videoStatus: null }));
	return uploadPage({ frame: member("filmer"), games, selectedId: GAME_ID }).__html;
}

/** The Go live page for game 7, as someone set to Watch and film sees it. `recordingVideoId`, `mine`, `ended` as the server sets them. */
export function goLivePage({ recordingVideoId = null, mine = false, ended = false } = {}) {
	return livePage({
		frame: member("filmer"), games: [game], selected: game, input: { uid: "input-7", whipUrl: "unused-the-page-gets-it-from-the-api" },
		unavailable: false, lastTry: null, recordingVideoId, mine, ended, recorded: [],
	}).__html;
}

/** The game page's live player, as Watch only sees it while the game is streamed. `whep`: the address it plays. */
export function livePlayerPage(whep) {
	return layout({ title: "Live", frame: member("watcher"), current: "games", scripts: ["/watch.js", "/whep.js"] }, livePlayer({ source: { whep }, isLive: true, ended: false })).__html;
}

/** The Photos page as someone set to Watch and film sees it before any are added; `address` has ?done=added once they're in. */
export function photosPage(address) {
	const message = PHOTOS_MESSAGES[address.searchParams.get("done") ?? ""] ?? null;
	return photosView({ frame: member("filmer"), photos: [], urls: new Map(), page: 1, pages: 1, message }).__html;
}

/** The Photos page with three photos, as someone set to Watch and film sees it: they added the first two (7 and 8). */
export function photosPageWithThree() {
	const photo = (id, uploadedBy) => ({ ...PHOTO, id, imageId: `img-${id}`, uploadedBy });
	const photos = [photo(9, 2), photo(8, 1), photo(7, 1)];
	return photosView({ frame: member("filmer"), photos, urls: new Map(photos.map((p) => [p.id, "/technical-difficulties.jpg"])), page: 1, pages: 1, message: null }).__html;
}

export const PHOTO = { id: 7, imageId: "img-7", takenAt: "2026-10-23T19:05:12", width: 360, height: 354, bytes: 15515, uploadedBy: 2, createdAt: "2026-10-24T08:00:00.000Z" };

/** One photo's page, as Watch only sees it: the picture (the site's own image stands in for Images' link) and saving it. */
export function photoPage({ id = PHOTO.id, newer = null, older = null } = {}) {
	const beside = (n) => (n ? "/technical-difficulties.jpg" : null);
	return photoView({
		frame: member("watcher"), photo: { ...PHOTO, id }, url: "/technical-difficulties.jpg", newer, older, newerUrl: beside(newer), olderUrl: beside(older),
		thumbUrl: "/technical-difficulties.jpg", newerThumb: beside(newer), olderThumb: beside(older), page: 1, addedBy: null, message: null,
	}).__html;
}

export const CLIP_ID = 5;

/** The game page with its video ready and one highlight clip, as Watch only sees it (no player: Stream isn't here). */
export function gamePageWithClip(videoId) {
	const video = {
		id: videoId, teamId: "b12.1-2026", gameId: GAME_ID, status: "ready", streamUid: "s1", r2Key: null, r2UploadId: null, originalName: null,
		originalBytes: null, durationSeconds: 2460, failureReason: null, uploadedBy: 1, deleteAfter: "2027-12-31T13:00:00.000Z", createdAt: "2026-10-23T09:00:00.000Z", hdReadyAt: "2026-10-23T09:40:00.000Z",
	};
	const clip = { id: CLIP_ID, videoId, label: "Steal", startSeconds: 10, endSeconds: 25, status: "ready", streamUid: "c5", createdBy: 1 };
	return watchPage({
		frame: member("watcher"), game, video, playerSrc: null, moveTargets: [], message: null, clips: [{ clip, thumbUrl: null, players: [] }], players: [],
		currentClip: null, coachNotes: "", live: null, upcoming: false, liveNote: null, result: { score: null, inProgress: false, hidden: false, back: `/games/${GAME_ID}` },
		blurb: "", scoreAdmin: "", stars: { game: false, clips: new Set() },
	}).__html;
}

/** Help as B12.1's team manager sees it: their own sections first, then everyone's, the search box and a chip for each. */
export function helpManagerPage() {
	return helpPage(member("manager"), helpFor(team, ALL_DUTIES)).__html;
}

/** Home as it opens: the team's name in the top bar (the rest of Home's markup isn't what these tests look at). */
export function homeStub() {
	return layout({ title: "Home", frame: member("watcher") }, html`<h1>Home</h1>`).__html;
}

/** Home as a team manager in two teams sees it: every small button (Roster to Help), and Switch team at the top. */
export function homeManagerPage() {
	const manager = { id: 1, teamId: TEAM_ID, email: "manager@example.com", name: "Sam", role: "manager", lastSeenAt: null, hideScores: false, hidden: false };
	const other = { ...team, id: "g14.5-2026", code: "g14.5", name: "Saints U14 Girls 14.5" };
	const viewer = { email: "manager@example.com", isAdmin: false, memberships: [{ team, member: manager }, { team: other, member: { ...manager, id: 2, teamId: other.id } }] };
	return homePage({ frame: { team, viewer, viewAs: null, member: manager }, latest: null, latestIsNew: false, latestScore: null, newCount: 0, live: [], players: [], deletesAfter: null }).__html;
}

/** Home as an admin who's B12.1's team manager sees it: as that, or (View as) as `viewAs`, with the strip that says so. */
export function adminHome(viewAs) {
	const frame = {
		team, viewer: { email: "manager@example.com", isAdmin: true, memberships: [] }, viewAs,
		member: { id: 1, teamId: TEAM_ID, email: "manager@example.com", name: "Sam", role: viewAs ?? "manager", lastSeenAt: null, hideScores: false, hidden: false },
	};
	return layout({ title: "Home", frame }, html`<h1>Home</h1>`).__html;
}

/** The admin area's Teams page, with B12.1 on it. */
export function adminTeamsPage() {
	const teams = [{ team, members: 16, managers: ["Sam Rivers"], lastSeenAt: null, openSupport: 0, setup: { players: 10, filmers: 1, coaches: 1, managers: 1, games: 8, duties: 16 } }];
	const frame = { viewer: { email: "manager@example.com", isAdmin: true, memberships: [] }, team, nav: { support: 0, alerts: 0, urgent: 0 } };
	return teamsListPage({ frame, teams, people: 16, now: new Date("2026-10-28T00:00:00Z") }).__html;
}

/** The Home Screen app's start address, /?app, answers the spinner; / answers Home. */
export const startPage = (address) => (address.searchParams.has("app") ? launchPage().__html : homeStub());

/** The sign-in page's two steps (the site's own sign-in): the email, then the code sent to it. */
// The e2e site key: the harness stands in Turnstile's script (signin.e2e.mjs), so it's never sent to Cloudflare.
export const signInEmailPage = (address) => signInPage({ step: "email", email: "", next: address.searchParams.get("next") ?? "/", message: null, siteKey: "e2e" }).__html;
export const signInCodePage = (email, message = null) => signInPage({ step: "code", email, next: "/", message, siteKey: "e2e" }).__html;

/** One photo's page as a team manager sees it: Delete photo, which asks first. */
export function photoPageManager() {
	return photoView({ frame: member("manager"), photo: PHOTO, url: "/technical-difficulties.jpg", newer: null, older: null, page: 1, addedBy: null, message: null }).__html;
}

/** Manage team as its team manager sees it: three other people on the list (two team managers, one with a long email, and a coach), Add a person,
 * Who's using the site and the end-of-season pack. */
export function managePage() {
	const person = (id, email, name, role) => ({ id, teamId: TEAM_ID, email, name, role, lastSeenAt: "2026-11-01T21:00:00.000Z", hideScores: false, hidden: false });
	const members = [person(1, "filmer@example.com", "Test Filmer", "manager"), person(2, "dani@example.com", "Dani", "manager"), person(3, "dev@example.com", "Dev", "coach"), person(4, "kevin.durant.family@example.com", "Kevin", "manager")];
	const activity = { total: 4, byRole: { manager: 3, coach: 1, filmer: 0, watcher: 0 }, week: 4, month: 0, older: 0, never: 0 };
	const pack = { games: [], clips: [], players: [], tagged: new Map(), photos: 0, keptUntil: "2027-03-31", open: false };
	return membersPage({ frame: member("manager"), members, players: [], message: null, removals: "", activity, sort: "role", waiting: [], steps: [], pack }).__html;
}
