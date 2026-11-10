// Saving a team's roster duties (roster-duties.ts): checked, saved, then the roster follows. A duty switched off goes
// from this week on; the weeks from next week on are shared out again, as Generate roster does, so a family given a
// duty every week has it and no other. This week stays as families already know it.
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { localDate } from "../../shared/time.ts";
import type { RosterDuties } from "./roster-duties.ts";
import { weekOf } from "./roster-plan.ts";
import { clearSlotsFrom, hasAnySlot, listFamilies, saveRosterDuties } from "./roster-repository.ts";
import { rosterWeeks, syncRoster } from "./roster-service.ts";

export async function saveDuties(deps: TeamDeps, input: RosterDuties): Promise<void> {
	const label = input.lolliesLabel.trim().replace(/\s+/g, " ");
	if (input.lollies && (!label || label.length > 30)) throw badRequest("Give the extra duty a name, up to 30 letters.");
	const families = (await listFamilies(deps.db, deps.team.id)).map((f) => f.id);
	const lolliesFamily = input.lollies ? input.lolliesFamily : null, videoFamily = input.video ? input.videoFamily : null;
	if ([lolliesFamily, videoFamily].some((f) => f !== null && !families.includes(f))) throw badRequest("Choose a family that's on the roster.");
	if (lolliesFamily !== null && lolliesFamily === videoFamily) throw badRequest("A family can only do one duty a week.");
	const duties = { lollies: input.lollies, lolliesLabel: label || "Lollies", lolliesFamily, video: input.video, videoFamily };
	await saveRosterDuties(deps.db, deps.team.id, duties, deps.now().toISOString());
	const next = (await rosterWeeks(deps)).find((w) => w.week > weekOf(localDate(deps.now())))?.week;
	if (next && families.length && (await hasAnySlot(deps.db, deps.team.id))) await clearSlotsFrom(deps.db, deps.team.id, next);
	await syncRoster(deps);
}
