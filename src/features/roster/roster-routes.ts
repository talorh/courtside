import { z } from "zod";
import { badRequest, notFound } from "../../app/errors.ts";
import { CLUB } from "../../club.ts";
import { fileResponse, htmlResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { isRealDate, localDate } from "../../shared/time.ts";
import { XLSX_TYPE, xlsxFile } from "../../shared/xlsx.ts";
import { doneMessage, idParam, parseForm } from "../../shared/validation.ts";
import { weekOf } from "./roster-plan.ts";
import { saveDuties } from "./duties-service.ts";
import { awayCredit } from "./roster-away.ts";
import { addFamilies, familyNames, familyPresence, getRosterDuties, listFamilies, removeFamily, saveRosterDuties } from "./roster-repository.ts";
import { dutiesFor, fairness, setWeek, syncRoster } from "./roster-service.ts";
import { setWeekScorersOnly, setWeekVideo } from "./roster-week-settings.ts";
import { ROSTER_MESSAGES, rosterPage } from "./views/roster-page.ts";
import { matchMessage } from "./match-message.ts";
import { messagePage } from "./views/message-page.ts";
import { rosterSheet } from "./roster-export.ts";
import { teamSeason } from "../teams/team-code.ts";

/** Far more than any team has, so a list pasted by mistake can't make a roster of thousands. */
const MAX_FAMILIES = 60;
/** Add families' rows: a surname a row (a list pasted into one, with commas, is split). */
const familiesSchema = z.object({ surname: z.array(z.string().max(2000)).max(100) });
const pick = z.coerce.number().int().positive().optional().catch(undefined);
// The Change form: a field a slot ("scoring1g42", roster-service.ts pickName), each a family's id or "" for the roster's pick.
const weekSchema = z.record(z.string(), pick).transform((all) => Object.fromEntries(Object.entries(all).filter(([k]) => /^(scoring|lollies|video)\d+g\d+$/.test(k))));
// The Duties panel (always two scorers): the extra duty and video on or off (a ticked box sends "1"), the extra
// duty's name, and for each, a family who does it every week ("" for shared out).
const family = z.union([z.literal(""), z.coerce.number().int().positive()]).optional().transform((f) => (typeof f === "number" ? f : null));
const dutiesSchema = z.object({
	lollies: z.literal("1").optional(), lolliesLabel: z.string().max(60).default("Lollies"), lolliesFamily: family,
	video: z.literal("1").optional(), videoFamily: family,
});
const weekParam = (value: string | undefined) => {
	if (!value || !isRealDate(value) || weekOf(value) !== value) throw notFound("Week");
	return value;
};

/** Roster: every member can see it; the team manager adds families, generates it and changes weeks. */
export function registerRosterRoutes(router: Router): void {
	router.get("/roster", "watcher", async ({ url, frame, deps }) => {
		const { weeks, slots, duties } = await syncRoster(deps);
		const families = await listFamilies(deps.db, deps.team.id);
		const ids = families.map((f) => f.id);
		return htmlResponse(rosterPage({
			frame, weeks, slots, families, duties, names: await familyNames(deps.db, deps.team.id),
			fair: fairness(slots, ids), away: awayCredit(slots, await familyPresence(deps.db, deps.team.id), ids, duties), thisWeek: weekOf(localDate(deps.now())), season: teamSeason(deps.team).label,
			message: doneMessage(ROSTER_MESSAGES, url),
		}));
	});

	// The roster as an Excel file, for Watch and film people, coaches and team managers. Like the page, it
	// brings the weeks up to date first (new games filled in, gone ones cleared).
	router.get("/roster/export.xlsx", "filmer", async ({ deps }) => {
		const { weeks, slots, duties } = await syncRoster(deps);
		const season = teamSeason(deps.team).label;
		const sheet = rosterSheet(weeks, slots, await familyNames(deps.db, deps.team.id), season, duties);
		return fileResponse(xlsxFile(sheet), XLSX_TYPE, `roster-${season.replace("/", "-")}.xlsx`);
	});

	// The match day message for the team chat, one a game (a weekend with several has one for each: `?game=`, the first
	// game's without it), with the uniform chosen each time from the club's (packing the other, when there is one).
	router.get("/roster/week/:week/message", "manager", async ({ url, params, frame, deps }) => {
		const week = weekParam(params.week);
		const { weeks, slots, duties } = await syncRoster(deps);
		const w = weeks.find((x) => x.week === week);
		if (!w) throw notFound("Week");
		const asked = url.searchParams.get("game");
		const game = asked === null ? w.games[0]!.game : w.games.find((g) => String(g.game.id) === asked)?.game;
		if (!game) throw notFound("Game");
		const uniform = CLUB.uniforms.find((u) => u === url.searchParams.get("uniform")) ?? CLUB.uniforms[0]!;
		const text = matchMessage({
			game, slots: slots.filter((s) => s.week === week && s.gameId === game.id), names: await familyNames(deps.db, deps.team.id),
			video: !game.noVideo && w.video, extra: w.extra, uniform, duties: dutiesFor(week, weekOf(localDate(deps.now())), duties),
		});
		return htmlResponse(messagePage({ frame, week, game: w.games.length > 1 ? game : null, uniform, text }));
	});

	router.post("/roster/families", "manager", async ({ req, deps }) => {
		const { surname } = await parseForm(req, familiesSchema, ["surname"]);
		const list = [...new Set(surname.flatMap((row) => row.split(/[\n,]/)).map((s) => s.trim().replace(/\s+/g, " ")).filter((s) => s.length > 0))];
		if (!list.length) throw badRequest("Type a family's surname.");
		if (list.some((s) => s.length > 40)) throw badRequest("A surname can be up to 40 letters. Put each family in its own row.");
		const on = new Set((await listFamilies(deps.db, deps.team.id)).map((f) => f.surname.toLowerCase()));
		if (on.size + list.filter((s) => !on.has(s.toLowerCase())).length > MAX_FAMILIES) throw badRequest(`A roster can have up to ${MAX_FAMILIES} families.`);
		await addFamilies(deps.db, deps.team.id, list, weekOf(localDate(deps.now())), deps.now().toISOString());
		return redirect("/roster?done=added#families");
	});

	router.post("/roster/families/:id/remove", "manager", async ({ params, deps }) => {
		const id = idParam(params.id, "Family");
		if (!(await listFamilies(deps.db, deps.team.id)).some((f) => f.id === id)) throw notFound("Family");
		await removeFamily(deps.db, deps.team.id, id, weekOf(localDate(deps.now())), deps.now().toISOString());
		// A family taken off no longer has a duty every week: it's shared out again.
		const d = await getRosterDuties(deps.db, deps.team.id);
		if (d.lolliesFamily === id || d.videoFamily === id) {
			await saveRosterDuties(deps.db, deps.team.id, { ...d, lolliesFamily: d.lolliesFamily === id ? null : d.lolliesFamily, videoFamily: d.videoFamily === id ? null : d.videoFamily }, deps.now().toISOString());
		}
		await syncRoster(deps);
		return redirect("/roster?done=removed#families");
	}, { confirm: true });

	// The team's duties (a team may not do lollies): from this week on, at once.
	router.post("/roster/duties", "manager", async ({ req, deps }) => {
		const form = await parseForm(req, dutiesSchema);
		await saveDuties(deps, { ...form, lollies: form.lollies === "1", video: form.video === "1" });
		return redirect("/roster?done=duties#duties");
	});

	router.post("/roster/generate", "manager", async ({ deps }) => {
		await syncRoster(deps, true);
		return redirect("/roster?done=generated");
	});

	router.post("/roster/week/:week", "manager", async ({ req, params, deps }) => {
		const week = weekParam(params.week);
		await setWeek(deps, week, await parseForm(req, weekSchema));
		return redirect(`/roster?done=saved#w${week}`);
	});

	for (const [path, video] of [["no-video", false], ["video", true]] as const) {
		router.post(`/roster/week/:week/${path}`, "manager", async ({ params, deps }) => {
			const week = weekParam(params.week);
			await setWeekVideo(deps, week, video);
			await syncRoster(deps);
			return redirect(`/roster?done=${video ? "video" : "novideo"}#w${week}`);
		});
	}
	// Scorers only this week: no extra duty and no video for a tournament; All duties undoes it.
	for (const [path, scorersOnly] of [["scorers-only", true], ["all-duties", false]] as const) {
		router.post(`/roster/week/:week/${path}`, "manager", async ({ params, deps }) => {
			const week = weekParam(params.week);
			await setWeekScorersOnly(deps, week, scorersOnly);
			await syncRoster(deps);
			return redirect(`/roster?done=${scorersOnly ? "scorersonly" : "allduties"}#w${week}`);
		});
	}
}
