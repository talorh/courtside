import { describe, expect, it } from "vitest";
import type { Role } from "../../../src/auth/permissions.ts";
import { helpFor } from "../../../src/features/help/views/faq-item.ts";
import { helpSections } from "../../../src/features/help/views/help-page.ts";
import { ALL_DUTIES } from "../../../src/features/roster/roster-duties.ts";
import { makeClient } from "../../helpers/app.ts";
import { B12_1, createTestDeps } from "../../helpers/fakes.ts";

const help = (role: Role, duties = ALL_DUTIES) => helpSections(helpFor(B12_1, duties), role).__html;
const ids = (html: string) => [...html.matchAll(/<details class="panel faq" id="([^"]+)"/g)].map((m) => m[1]);
/** Each question as written, by its id. */
// The screenshots are new on purpose: the words are compared without them.
const questions = (html: string) => new Map([...html.replace(/\n?<figure class="shot">[\s\S]*?<\/figure>/g, "").replace(/\n?<div class="shots">[\s\S]*?<\/div>/g, "")
	.matchAll(/<details class="panel faq" id="([^"]+)">[\s\S]*?<\/details>/g)].map((m) => [m[1], m[0]]));
const section = (html: string, id: string) => questions(html).get(id) ?? "";

const FILMING = ["duty", "record-iphone", "record-android", "upload-help", "live-game", "live-browser", "ai-cameras"];
const EVERYONE = ["signin", "install", "computer", "who", "about-me"];
const WATCHING = ["watch", "tv", "clips", "labels", "kept"];

describe("Help for each person (only the help that's relevant to them)", () => {
	it("gives each role only its own questions: Getting started first, a team manager's own next", () => {
		expect(ids(help("watcher"))).toEqual([...EVERYONE, "buttons", ...WATCHING, "photos", "roster", "safety", "aim"]);
		expect(ids(help("filmer"))).toEqual([...EVERYONE, ...FILMING, ...WATCHING, "photos", "roster", "safety", "aim"]);
		expect(ids(help("coach"))).toEqual([...EVERYONE, ...FILMING, ...WATCHING, "notes", "photos", "safety", "aim"]);
		// A team manager's own questions first (running the team, ending with removal requests), then what everyone does,
		// child safety last. Everyone else keeps child safety before the aim.
		const manager = ids(help("manager"));
		expect(manager.slice(0, 3)).toEqual(["g-first", "g-add", "g-roles"]);
		expect(manager.slice(manager.indexOf("g-clips"))).toEqual(["g-clips", "g-photos", "g-requests", ...EVERYONE, ...FILMING, ...WATCHING, "photos", "roster", "aim", "safety"]);
	});

	it("never gives Watch only the video duty checklist, whatever their team rosters (they don't film)", () => {
		for (const video of [true, false]) {
			const family = help("watcher", { ...ALL_DUTIES, video });
			expect(ids(family)).not.toContain("duty");
			expect(family).not.toContain('href="#duty"');
			expect(family).not.toContain("On video duty");
			expect(family).not.toContain("your turn on video duty");
		}
	});

	it("gives coaches filming help, as they film too, and their notes", () => {
		const coach = help("coach");
		for (const words of ["Recording and uploading", "Live streaming", "Go live", "Upload video", "On video duty"]) expect(coach, words).toContain(words);
		expect(section(coach, "notes")).toContain("<summary>Coaches&#39; notes</summary>");
		expect(section(coach, "notes")).toContain("Only coaches see them.");
	});

	it("gives everyone the same child safety answer: the standards body's link, and the club's handbook and website", () => {
		const answers = (["watcher", "filmer", "coach", "manager"] as const).map((role) => section(help(role), "safety"));
		for (const answer of answers) expect(answer).toBe(answers[0]);
		expect(answers[0]).not.toContain("<li>");
	});

	it("tells everyone how to add photos, families too", () => {
		for (const role of ["watcher", "filmer", "coach", "manager"] as const) {
			expect(section(help(role), "photos"), role).toContain("<b>Adding:</b> anyone on the team can add photos. Tap <b>Photos</b>, then <b>Choose photos</b>");
		}
	});
});

describe("Help's page: find a question quickly", () => {
	it("has a search box (shown once its script runs), and no section chips (there aren't many sections)", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'c@x.com', 'Coach', 'coach')").bind(deps.team.id).run();
		const page = await (await makeClient(deps, "c@x.com")("/help")).text();
		expect(page).toContain('<input type="search" id="help-search" placeholder="Search Help" aria-label="Search Help" autocomplete="off" hidden>');
		expect(page).toContain('<script type="module" src="/help-search.js"></script>');
		expect(page).not.toContain("helpchips");
		for (const id of ["h-start", "h-watching", "h-coaches", "h-photos", "h-safety", "h-about"]) expect(page, id).toContain(`<section class="helpgroup" id="${id}">`);
	});
});
