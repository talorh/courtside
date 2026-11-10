import { describe, expect, it } from "vitest";
import { awayCredit, closeAway, onRoster, type Presence } from "../../../src/features/roster/roster-away.ts";
import { ALL_DUTIES } from "../../../src/features/roster/roster-duties.ts";
import { fillWeeks, type Slot } from "../../../src/features/roster/roster-plan.ts";
import { familiesForm, form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

const MONDAYS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 9, 12 + 7 * i)).toISOString().slice(0, 10));
const slot = (week: string, duty: Slot["duty"], familyId: number, position = 1): Slot => ({ week, duty, position, gameId: 1, familyId });
const on = (id: number, joined = "2026-10-12", away: Presence["away"] = []): Presence => ({ id, joined, away });

describe("time off the roster", () => {
	it("is on the roster from the week it was added, except its weeks away (back is the first week back)", () => {
		const f = on(1, "2026-10-12", [["2026-10-19", "2026-11-02"], ["2026-11-16", null]]);
		expect(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-12-07"].map((w) => onRoster(f, w)))
			.toEqual([false, true, false, false, true, true, false, false]);
	});
	it("counts each week away as the family's share of that week's duties, among the families on then", () => {
		// Four families on; the fifth away two weeks: each week's 4 duties over 4 families is one each.
		const held = ["2026-10-19", "2026-10-26"].flatMap((w) => [slot(w, "scoring", 1), slot(w, "scoring", 2, 2), slot(w, "lollies", 3), slot(w, "video", 4)]);
		const all = [on(1), on(2), on(3), on(4), on(5, "2026-10-12", [["2026-10-19", "2026-11-02"]])];
		expect(awayCredit(held, all, [1, 5]).get(5)).toEqual({ duty: { scoring: 1, lollies: 0.5, video: 0.5 }, total: 2, before: 0, off: 2 });
		expect(awayCredit(held, all, [1, 5]).get(1)!.total).toBe(0);
		// Three on: a third each, rounded so three weeks make one whole duty.
		const three = ["2026-10-19", "2026-10-26", "2026-11-02"].map((w) => slot(w, "scoring", 1));
		expect(awayCredit(three, [on(1), on(2), on(3), on(4, "2026-11-09")], [4]).get(4)).toMatchObject({ total: 1, before: 3, off: 0 });
	});
	it("gives nothing for a week no one was on, a week it had a duty in anyway, or a family on one duty every week", () => {
		const before = [slot("2026-10-05", "scoring", 1)];
		expect(awayCredit(before, [on(1), on(2, "2026-10-26")], [2]).get(2)!.total).toBe(0);
		const byHand = [slot("2026-10-19", "scoring", 1), slot("2026-10-19", "video", 2)];
		expect(awayCredit(byHand, [on(1), on(2, "2026-10-12", [["2026-10-19", "2026-10-26"]])], [2]).get(2)!.total).toBe(0);
		// Family 3 films every game: its video isn't shared, so the away family's share is of the scoring alone, among 1 and 2.
		const held = [slot("2026-10-19", "scoring", 1), slot("2026-10-19", "scoring", 2, 2), slot("2026-10-19", "video", 3)];
		const credit = awayCredit(held, [on(1), on(2), on(3), on(4, "2026-10-26")], [4], { ...ALL_DUTIES, videoFamily: 3 }).get(4)!;
		expect(credit).toEqual({ duty: { scoring: 1, lollies: 0, video: 0 }, total: 1, before: 1, off: 0 });
	});
	it("closes the time away when the family's back; one taken off before time away was kept gets it from the week it went", () => {
		expect(closeAway([["2026-10-19", null]], "2026-10-19", "2026-11-02")).toEqual([["2026-10-19", "2026-11-02"]]);
		expect(closeAway([], "2026-10-19", "2026-11-02")).toEqual([["2026-10-19", "2026-11-02"]]);
		expect(closeAway([["2026-10-12", "2026-10-19"]], "2026-10-26", "2026-11-02")).toEqual([["2026-10-12", "2026-10-19"], ["2026-10-26", "2026-11-02"]]);
	});
	it("fills the weeks after it's back as if it had done its share: no run of duties to catch up", () => {
		const families = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const weeks = MONDAYS.map((week, i) => ({ week, video: true, games: [{ id: 100 + i, video: true }] }));
		// Six weeks with family 10 away, then the rest of the season with it back.
		const held = fillWeeks(weeks.slice(0, 6), families.slice(0, 9), []);
		const all = [...families.slice(0, 9).map((id) => on(id)), on(10, "2026-10-12", [["2026-10-12", MONDAYS[6]!]])];
		const after = (credit?: ReturnType<typeof awayCredit>) => fillWeeks(weeks.slice(6), families, held, ALL_DUTIES, credit);
		const runs = (slots: Slot[]) => MONDAYS.slice(6, 10).filter((w) => slots.some((s) => s.week === w && s.familyId === 10)).length;
		expect(runs(after())).toBe(4); // without it: a duty every week to catch up
		const fair = after(awayCredit(held, all, families));
		expect(runs(fair)).toBeLessThanOrEqual(2);
		const counts = families.map((f) => fair.filter((s) => s.familyId === f).length);
		expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
	});
});

const SURNAMES = ["Smith", "Bruce", "Brown", "Lee", "Patel", "Jones", "Chen", "Wong", "Kelly", "Ryan"];
const at = (deps: TestDeps, iso: string) => { deps.now = () => new Date(iso); };
const idOf = async (deps: TestDeps, surname: string) => (await deps.db.prepare("SELECT id FROM roster_families WHERE surname = ? AND removed_at IS NULL").bind(surname).first<number>("id"))!;
const weeksOn = async (deps: TestDeps, id: number) => (await deps.db.prepare("SELECT DISTINCT week FROM roster_slots WHERE family_id = ? ORDER BY week").bind(id).all<{ week: string }>()).results.map((r) => r.week);

async function season() {
	const deps = createTestDeps();
	for (const week of MONDAYS) await seedGame(deps, { startsAt: `${new Date(Date.parse(week) + 4 * 86_400_000).toISOString().slice(0, 10)}T18:40` });
	const manager = makeClient(deps);
	await manager("/roster/families", familiesForm(SURNAMES.join("\n")));
	await manager("/roster/generate", form({}));
	return { deps, manager };
}

describe("a family away for a while, on the Roster", () => {
	it("taken off for six weeks and added back by its surname, Generate doesn't give it duty after duty to catch up", async () => {
		const { deps, manager } = await season();
		const smith = await idOf(deps, "Smith");
		await manager(`/roster/families/${smith}/remove`, form({ confirm: "yes" }));
		at(deps, "2026-11-25T00:00:00Z"); // six weeks on: the week of 23 Nov
		await manager("/roster/families", familiesForm("smith"));
		expect(await deps.db.prepare("SELECT away FROM roster_families WHERE id = ?").bind(smith).first<string>("away")).toBe('[["2026-10-12","2026-11-23"]]');
		await manager("/roster/generate", form({}));
		// Of the four weeks from 23 Nov, as anyone else (it was all four before time away counted).
		expect((await weeksOn(deps, smith)).filter((w) => w >= "2026-11-23" && w < "2026-12-21").length).toBeLessThanOrEqual(2);
		const page = await (await manager("/roster")).text();
		expect(page).toContain("<b>Fair:</b>");
		expect(page).toContain("Smith: 6 weeks off the roster");
	});
	it("a family added partway through the season counts the weeks before it as its share", async () => {
		const { deps, manager } = await season();
		at(deps, "2026-11-25T00:00:00Z");
		await manager("/roster/families", familiesForm("Nguyen"));
		await manager("/roster/generate", form({}));
		const nguyen = await idOf(deps, "Nguyen");
		expect((await weeksOn(deps, nguyen)).filter((w) => w < "2026-12-21").length).toBeLessThanOrEqual(2);
		const page = await (await manager("/roster")).text();
		expect(page).toContain("<b>Fair:</b>");
		expect(page).toContain("Nguyen: 6 weeks before it was added");
	});
	it("a family taken off before time away was kept comes back away from the week it went", async () => {
		const { deps, manager } = await season();
		const lee = await idOf(deps, "Lee");
		await deps.db.prepare("UPDATE roster_families SET removed_at = '2026-10-20T01:00:00.000Z' WHERE id = ?").bind(lee).run();
		at(deps, "2026-11-04T00:00:00Z");
		await manager("/roster/families", familiesForm("Lee"));
		expect(await deps.db.prepare("SELECT away FROM roster_families WHERE id = ?").bind(lee).first<string>("away")).toBe('[["2026-10-19","2026-11-02"]]');
	});
});
