// A team's life after onboarding: fixing its details, closing it at the end of its
// season (read-only, deleted when its footage is due or tonight), reopening it, and when it's deleted. Each change is
// made only from the state it applies to, then logged (a change someone else made first logs nothing).
import type { AppDeps } from "../../app/deps.ts";
import { badRequest, conflict } from "../../app/errors.ts";
import { nextLocal3am, seasonEndDeadline, seasonLabel } from "../../shared/time.ts";
import { hasGames } from "../games/games-repository.ts";
import { listOpenLive } from "../live/live-repository.ts";
import { teamLabel, teamNames } from "../teams/team-code.ts";
import { isBeingDeleted, type Team } from "../teams/team.ts";
import { closeTeamWrite, findOpenTeam, reopenTeamWrite, setDeleteAfterWrite, updateTeam } from "../teams/teams-repository.ts";
import { listVideosByStatus } from "../videos/videos-repository.ts";
import { type AdminAction, adminLogStatement } from "./admin-log-repository.ts";
import { onboardSeasons, parseCode } from "./teams-admin-service.ts";

// As the release's quiet check (scripts/release-checks.mjs): a part goes up about every 25 seconds while a phone films
// or uploads, and the 5-minute run notes a live picture, so this long with neither means nothing is going on.
const QUIET_MS = 15 * 60_000;

const log = (deps: AppDeps, adminEmail: string, team: Team, action: AdminAction, detail = "") =>
	adminLogStatement(deps.db, { device: deps.device, adminEmail, teamId: team.id, action, detail, at: deps.now().toISOString() }).run();
const unique = (err: unknown) => String(err).includes("UNIQUE constraint failed");

export interface EditInput { code: string; season: string; askName: string }

/** Who to ask, any time; the code and season (to fix a typo) only until the team's first game. */
export async function editTeam(deps: AppDeps, adminEmail: string, team: Team, input: EditInput): Promise<void> {
	if (isBeingDeleted(team, deps.now())) throw conflict(`${teamLabel(team)} is being deleted.`);
	const code = parseCode(input.code).code;
	const seasonStart = Number(input.season);
	if ((code !== team.code || seasonStart !== team.seasonStart) && await hasGames(deps.db, team.id)) {
		throw conflict(`${teamLabel(team)} has games now, so its code and season stay as they are.`);
	}
	if (seasonStart !== team.seasonStart && !onboardSeasons(deps.now()).includes(seasonStart)) throw badRequest("Pick this season or next season.");
	const open = code !== team.code && team.status === "active" ? await findOpenTeam(deps.db, code) : null;
	if (open) throw conflict(`${teamLabel(open)} is still open: close it first.`);
	const askName = input.askName.trim() || null;
	const changes = [
		code !== team.code ? `code ${team.code} to ${code}` : "", seasonStart !== team.seasonStart ? `season ${seasonLabel(team.seasonStart)} to ${seasonLabel(seasonStart)}` : "",
		askName !== team.askName ? `who to ask: ${askName ?? "your team manager"}` : "",
	].filter(Boolean);
	if (!changes.length) return;
	// A closed team waiting for its season's date keeps waiting for its new season's.
	const deleteAfter = team.deleteAfter === seasonEndDeadline(team.seasonStart) ? seasonEndDeadline(seasonStart) : team.deleteAfter;
	const result = await updateTeam(deps.db, { ...team, code, name: teamNames(code).long, seasonStart, askName, deleteAfter }).catch((err: unknown) => {
		throw unique(err) ? conflict(`An open team has the code ${code} now: pick another.`) : err;
	});
	if (!result.meta.changes) throw conflict(`${teamLabel(team)} has just been deleted.`);
	await log(deps, adminEmail, team, "team_edited", changes.join(", "));
}

/** Something a phone is sending to the team right now: a live stream, or an upload or recording sending parts. Closing
 * then would refuse its next part, and the video would be lost. */
async function busy(deps: AppDeps, team: Team): Promise<boolean> {
	const recent = (iso: string | null | undefined) => !!iso && deps.now().getTime() - Date.parse(iso) < QUIET_MS;
	if ((await listOpenLive(deps.db, team.id)).some((l) => recent(l.lastLiveAt ?? l.createdAt))) return true;
	for (const video of await listVideosByStatus(deps.db, team.id, "uploading")) {
		const parts = video.r2Key && video.r2UploadId ? await deps.presigner.listParts(video.r2Key, video.r2UploadId) : null;
		if (recent(parts?.map((p) => p.uploaded).sort().at(-1) ?? video.createdAt)) return true;
	}
	return false;
}

/** Read-only at once; deleted when its footage is due (what Help tells families), or tonight with its code typed. */
export async function closeTeam(deps: AppDeps, adminEmail: string, team: Team, input: { when: string; confirmCode: string }): Promise<void> {
	if (team.status !== "active") throw conflict(`${teamLabel(team)}'s season is over already.`);
	const tonight = input.when === "tonight";
	if (tonight && input.confirmCode.trim().toLowerCase() !== team.code) throw badRequest(`Type ${team.code} to delete it tonight.`);
	if (await busy(deps, team)) throw conflict(`${teamLabel(team)} has an upload or live stream going: close it once that's done.`);
	const now = deps.now();
	const deleteAfter = tonight ? nextLocal3am(now).toISOString() : seasonEndDeadline(team.seasonStart);
	if (!(await closeTeamWrite(deps.db, team.id, now.toISOString(), deleteAfter)).meta.changes) throw conflict(`${teamLabel(team)}'s season is over already.`);
	await log(deps, adminEmail, team, "team_closed", tonight ? "deleted tonight" : "deleted at the season's end");
}

export async function reopenTeam(deps: AppDeps, adminEmail: string, team: Team): Promise<void> {
	if (team.status !== "closed") throw conflict(`${teamLabel(team)} is open already.`);
	if (isBeingDeleted(team, deps.now())) throw conflict(`Deleting ${teamLabel(team)} has started, so it can't be reopened.`);
	const open = await findOpenTeam(deps.db, team.code);
	const taken = (other: Team | null) => conflict(`${other ? teamLabel(other, { season: true }) : "Another team"} has its code now: close that first.`);
	if (open) throw taken(open);
	const result = await reopenTeamWrite(deps.db, team.id, deps.now().toISOString()).catch((err: unknown) => { throw unique(err) ? taken(null) : err; });
	if (!result.meta.changes) throw conflict(`${teamLabel(team)} can't be reopened now: reload Teams.`);
	await log(deps, adminEmail, team, "team_reopened");
}

/** A closed team's videos, photos and the rest go at 3am tonight instead of when they're due; its code typed to confirm. */
export async function deleteTonight(deps: AppDeps, adminEmail: string, team: Team, confirmCode: string): Promise<void> {
	if (team.status !== "closed") throw conflict(`${teamLabel(team)} is open: close it first.`);
	if (isBeingDeleted(team, deps.now())) throw conflict(`${teamLabel(team)} is being deleted already.`);
	if (confirmCode.trim().toLowerCase() !== team.code) throw badRequest(`Type ${team.code} to delete it tonight.`);
	const now = deps.now();
	const at = nextLocal3am(now).toISOString();
	if (team.deleteAfter && team.deleteAfter <= at) return;
	if (!(await setDeleteAfterWrite(deps.db, team.id, at, now.toISOString())).meta.changes) throw conflict(`${teamLabel(team)} is being deleted already.`);
	await log(deps, adminEmail, team, "delete_scheduled");
}

/** Back to when its footage is due, until deleting starts. */
export async function cancelDelete(deps: AppDeps, adminEmail: string, team: Team): Promise<void> {
	const now = deps.now();
	if (team.status !== "closed") throw conflict(`${teamLabel(team)} is open.`);
	if (isBeingDeleted(team, now)) throw conflict(`Deleting ${teamLabel(team)} has started, so it can't be cancelled.`);
	const due = seasonEndDeadline(team.seasonStart);
	if (due <= now.toISOString()) throw conflict(`${teamLabel(team)}'s season's date has passed, so it can't wait any longer.`);
	if (team.deleteAfter === due) return;
	if (!(await setDeleteAfterWrite(deps.db, team.id, due, now.toISOString())).meta.changes) throw conflict(`Deleting ${teamLabel(team)} has started, so it can't be cancelled.`);
	await log(deps, adminEmail, team, "delete_cancelled");
}
