// Manage team's Add from a spreadsheet, once the sheet is read (members-csv.ts): who on it is new and who's on the team
// already, then the new people added as Add a person adds one, and logged the same way. People already on the team are
// left exactly as they are.
import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { ROLES } from "../../auth/permissions.ts";
import { logTeamChange, personOf, roleOf } from "../admin/team-log.ts";
import { MAX_PEOPLE } from "./members-csv.ts";
import { listActiveMembers } from "./members-repository.ts";
import { addMembers, type NewPerson, tidyRows } from "./members-service.ts";

/** A person on the sheet, and whether they're on the team already. */
export interface SheetPerson extends NewPerson { onTeam: boolean }

/** The add step's form: the new people as JSON, checked again here (the page could have been changed). */
export const importSchema = z.object({ people: z.string().max(100_000) });
const peopleSchema = z.array(z.object({ email: z.string().max(254), name: z.string().max(80), role: z.enum(ROLES) })).min(1).max(MAX_PEOPLE);

export async function sheetPeople(db: D1Database, teamId: string, people: NewPerson[]): Promise<SheetPerson[]> {
	const onTeam = new Set((await listActiveMembers(db, teamId)).map((m) => m.email.toLowerCase()));
	return people.map((p) => ({ ...p, onTeam: onTeam.has(p.email) }));
}

/** Adds the sheet's new people; how many. */
export async function addFromSheet(deps: TeamDeps, actor: string, json: string): Promise<number> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (err) {
		throw badRequest("The list of people didn't come through. Choose the spreadsheet again.", err);
	}
	const people = peopleSchema.safeParse(parsed);
	if (!people.success) throw badRequest("The list of people didn't come through. Choose the spreadsheet again.");
	const fresh = (await sheetPeople(deps.db, deps.team.id, tidyRows(people.data))).filter((p) => !p.onTeam);
	if (fresh.length === 0) return 0;
	const added = await addMembers(deps.db, deps.team.id, fresh.map(({ email, name, role }) => ({ email, name, role })));
	await logTeamChange(deps, actor, "member_added", added.map((p) => `${personOf(p)} as ${roleOf(p.role)}`).join(", "));
	return added.length;
}
