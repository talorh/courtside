// Onboarding a team: just enough to get it going. Its team manager does the rest from
// Help (their own questions come first there), started by the welcome the site emails them.
import type { AppDeps } from "../../app/deps.ts";
import { badRequest, conflict } from "../../app/errors.ts";
import { seasonOf } from "../../shared/time.ts";
import { newMemberStatement } from "../members/members-repository.ts";
import { isEmail } from "../members/members-service.ts";
import { newTeamId, parseTeamCode, teamLabel, teamNames } from "../teams/team-code.ts";
import type { Team } from "../teams/team.ts";
import { findOpenTeam, findTeamBySeason, getTeam, insertTeamStatement } from "../teams/teams-repository.ts";
import { adminLogStatement } from "./admin-log-repository.ts";

/** A code as typed, or why it isn't one. */
export function parseCode(text: string) {
	const parsed = parseTeamCode(text);
	if (!parsed) throw badRequest(`"${text.trim()}" isn't a team code. It's b or g, the age group, a dot and the team's number: b12.1, g14.5.`);
	return parsed;
}

export interface OnboardInput { code: string; season: string; managerName: string; managerEmail: string; askName: string }

/** The seasons a team can be onboarded for: this one and the next. */
export function onboardSeasons(now: Date): number[] {
	const { start } = seasonOf(now);
	return [start, start + 1];
}

export async function onboardTeam(deps: AppDeps, adminEmail: string, input: OnboardInput): Promise<Team> {
	const parsed = parseCode(input.code);
	const seasonStart = Number(input.season);
	if (!onboardSeasons(deps.now()).includes(seasonStart)) throw badRequest("Pick this season or next season.");
	const name = input.managerName.trim();
	if (!name) throw badRequest("Enter the team manager's name.");
	const email = input.managerEmail.trim().toLowerCase();
	if (!isEmail(email)) throw badRequest(`"${input.managerEmail.trim()}" isn't an email address.`);
	const open = await findOpenTeam(deps.db, parsed.code);
	if (open) throw conflict(`${teamLabel(open)} is still open: close it first.`);
	const team: Team = {
		id: await freeTeamId(deps.db, parsed.code, seasonStart), code: parsed.code, name: teamNames(parsed.code).long, seasonStart,
		askName: input.askName.trim() || null, status: "active", closedAt: null, deleteAfter: null,
	};
	try {
		await deps.db.batch([
			insertTeamStatement(deps.db, team), newMemberStatement(deps.db, team.id, { email, name, role: "manager" }),
			adminLogStatement(deps.db, { device: deps.device, adminEmail, teamId: team.id, action: "team_onboarded", detail: team.code, at: deps.now().toISOString() }),
		]);
	} catch (err) {
		// Someone else onboarded the same code (or the same team) a moment ago: the database keeps it to one.
		if (String(err).includes("UNIQUE constraint failed")) throw conflict(`${teamLabel(team)} was set up a moment ago: check the list.`);
		throw err;
	}
	return team;
}

/** "<code>-<season>", or with "-2" and on when that id is taken (by a deleted team, its download log kept for two years,
 * or a team whose code was fixed after onboarding). The same code and season, closed, is reopened instead. */
async function freeTeamId(db: D1Database, code: string, seasonStart: number): Promise<string> {
	const same = await findTeamBySeason(db, code, seasonStart);
	if (same?.status === "closed") throw conflict(`${teamLabel(same, { season: true })} is here already, closed: reopen it from the list instead.`);
	for (let n = 1; n <= 9; n++) {
		const id = n === 1 ? newTeamId(code, seasonStart) : `${newTeamId(code, seasonStart)}-${n}`;
		if (!(await getTeam(db, id))) return id;
	}
	throw conflict(`${teamNames(code).short} has been set up too many times this season: pick next season.`);
}
