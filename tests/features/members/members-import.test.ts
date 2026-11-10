import { describe, expect, it } from "vitest";
import { readPeopleCsv } from "../../../src/features/members/members-csv.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember } from "../../helpers/two-teams.ts";

// Manage team's Add from a spreadsheet: a template to download (Name, Email, Role), the filled-in sheet saved as CSV,
// every row shown first (new, already on the team, or a problem), then the new people added, as Add a person adds one.

const upload = (deps: TestDeps, text: string, name = "people.csv") => {
	const body = new FormData();
	body.set("file", new File([text], name, { type: "text/csv" }));
	return makeClient(deps)("/members/sheet", { method: "POST", body });
};
const roleOf = async (deps: TestDeps, email: string) =>
	(await deps.db.prepare("SELECT role FROM members WHERE team_id = ? AND email = ? AND removed_at IS NULL").bind(deps.team.id, email).first<{ role: string }>())?.role ?? null;

describe("reading a people spreadsheet", () => {
	it("a name or address longer than Add a person allows is a row to fix, not a sheet that won't add", () => {
		const long = "Steph Curry's grandmother from the Warriors family day who films every home game ever played";
		const read = readPeopleCsv(`Name,Email,Role\n${long},nan@example.com,Watch only\nJordan's dad,${"j".repeat(250)}@example.com,\nKD's mum,kd@example.com,\n`);
		expect(read.people).toEqual([{ email: "kd@example.com", name: "KD's mum", role: "watcher" }]);
		expect(read.problems).toEqual([
			`Row 2 (${long}): the name is longer than 80 letters. Shorten it on the sheet.`,
			`Row 3 (Jordan's dad): "${"j".repeat(250)}@example.com" isn't an email address.`,
		]);
	});
	it("reads Name, Email and Role in any order and case, a blank role as Watch only, and the usual ways of saying each role", () => {
		const read = readPeopleCsv("EMAIL ADDRESS,Full name,role\nSteph.Mum@Example.com , Steph's mum ,Watch and film\njordan.dad@example.com,Jordan's dad,\ncoach@example.com,Coach Kerr,coach\nlead@example.com,,Team Manager\nkd@example.com,KD's mum,parent\nfilm@example.com,,film\n");
		expect(read.problems).toEqual([]);
		expect(read.people).toEqual([
			{ email: "steph.mum@example.com", name: "Steph's mum", role: "filmer" },
			{ email: "jordan.dad@example.com", name: "Jordan's dad", role: "watcher" },
			{ email: "coach@example.com", name: "Coach Kerr", role: "coach" },
			{ email: "lead@example.com", name: "", role: "manager" },
			{ email: "kd@example.com", name: "KD's mum", role: "watcher" },
			{ email: "film@example.com", name: "", role: "filmer" },
		]);
	});
	it("says which row has a problem (a missing or wrong email, a role it can't read), skips blank rows and keeps a repeat once", () => {
		const read = readPeopleCsv("Name;Email;Role\nSteph's mum;steph@example.com;Watch only\n;;\nNo email;;\nBad;not-an-email;\nOdd;odd@example.com;Superhero\nAgain;STEPH@example.com;Coach\n");
		expect(read.people).toEqual([{ email: "steph@example.com", name: "Steph's mum", role: "watcher" }]);
		expect(read.problems).toEqual([
			"Row 4 (No email): it has no email address.",
			"Row 5 (Bad): \"not-an-email\" isn't an email address.",
			"Row 6 (Odd): the role \"Superhero\" isn't one the site has (Watch only, Watch and film, Coach or Team manager).",
			"Row 7 (Again): steph@example.com is on the sheet already, so this row is left out.",
		]);
	});
	it("finds the header row after blank ones at the top, and reads an address written as Name <email>", () => {
		const read = readPeopleCsv("\n,,\nName,Email,Role\nSteph's mum,Steph's mum <Steph.Mum@example.com>,Coach\n");
		expect(read).toEqual({ people: [{ email: "steph.mum@example.com", name: "Steph's mum", role: "coach" }], problems: [] });
		// Row numbers still match the sheet's own.
		expect(readPeopleCsv("\nName,Email\nBad,nope\n").problems).toEqual(["Row 3 (Bad): \"nope\" isn't an email address."]);
	});
	it("needs an Email column", () => {
		expect(readPeopleCsv("Name,Role\nSteph's mum,Coach\n")).toEqual({ people: [], problems: ["The sheet has no Email column. Start from the template: its first row is Name, Email, Role."] });
	});
});

describe("Add from a spreadsheet on Manage team", () => {
	it("has the template to download, a CSV of made-up people with the three columns", async () => {
		const res = await makeClient(createTestDeps())("/members/sample.csv");
		expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
		expect(res.headers.get("Content-Disposition")).toContain('filename="people-template.csv"');
		const text = await res.text();
		expect(text.split("\n")[0]).toBe("Name,Email,Role");
		expect(readPeopleCsv(text).problems).toEqual([]);
		const page = await (await makeClient(createTestDeps())("/manage")).text();
		expect(page).toContain('<summary class="btn">Add from a spreadsheet</summary>');
		expect(page).toContain('<a href="/members/sample.csv" download>template</a>');
	});
	it("shows every row first: who's new, who's on the team already (left as they are), and the problems; nothing's added yet", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "jordan.dad@example.com", "coach");
		const page = await (await upload(deps, "Name,Email,Role\nSteph's mum,steph.mum@example.com,Watch and film\nJordan's dad,jordan.dad@example.com,Watch only\nBad,nope,\n")).text();
		expect(page).toMatch(/<td>Steph&#39;s mum<\/td><td>steph\.mum@example\.com<\/td><td>Watch and film<\/td><td><span class="role c">New<\/span><\/td>/);
		expect(page).toMatch(/<td>jordan\.dad@example\.com<\/td><td>Watch only<\/td><td><span class="role">On the team already: left as they are<\/span><\/td>/);
		expect(page).toContain("Row 4 (Bad): &quot;nope&quot; isn&#39;t an email address.");
		expect(page).toContain("<button class=\"btn primary\">Add 1 person</button>");
		expect(await roleOf(deps, "steph.mum@example.com")).toBeNull();
	});
	it("adds the new people with their roles, leaves anyone already on the team as they are, and logs who was added", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "jordan.dad@example.com", "coach");
		const people = JSON.stringify([{ email: "steph.mum@example.com", name: "Steph's mum", role: "filmer" }, { email: "jordan.dad@example.com", name: "Jordan's dad", role: "watcher" }]);
		const res = await makeClient(deps)("/members/import", form({ people }));
		expect(res.headers.get("Location")).toBe("/manage?done=imported#people");
		expect(await roleOf(deps, "steph.mum@example.com")).toBe("filmer");
		expect(await roleOf(deps, "jordan.dad@example.com")).toBe("coach");
		const log = await deps.db.prepare("SELECT admin_email, detail FROM admin_log WHERE action = 'member_added'").first<{ admin_email: string; detail: string }>();
		expect(log).toEqual({ admin_email: MANAGER, detail: "Steph's mum (steph.mum@example.com) as watch and film" });
		expect(await (await makeClient(deps)("/manage?done=imported")).text()).toContain("Added the new people from your spreadsheet.");
		expect((await makeClient(deps)("/members/import", form({ people: JSON.stringify([{ email: "jordan.dad@example.com", name: "", role: "watcher" }]) }))).headers.get("Location")).toBe("/manage?done=importnone#people");
	});
	it("refuses an Excel file, an empty upload and a list that's been tampered with; only a team manager can use it", async () => {
		const deps = createTestDeps();
		const excel = await (await upload(deps, "PK\u0003\u0004 not a csv", "people.xlsx")).text();
		expect(excel).toContain("That&#39;s an Excel file. Save it as CSV first");
		expect((await makeClient(deps)("/members/sheet", { method: "POST", body: new FormData() })).status).toBe(400);
		const bad = form({ people: JSON.stringify([{ email: "nope", name: "", role: "watcher" }]) });
		expect((await makeClient(deps)("/members/import", bad)).status).toBe(400);
		const wrongRole = form({ people: JSON.stringify([{ email: "a@example.com", name: "", role: "owner" }]) });
		expect((await makeClient(deps)("/members/import", wrongRole)).status).toBe(400);
		await addMember(deps.db, deps.team.id, "fam@example.com", "filmer");
		for (const path of ["/members/sample.csv", "/members/sheet", "/members/import"]) {
			const res = await makeClient(deps, "fam@example.com")(path, path.endsWith(".csv") ? undefined : form({}));
			expect(res.status).toBe(403);
		}
	});
});
