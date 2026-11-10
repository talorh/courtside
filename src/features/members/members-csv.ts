// Manage team's Add from a spreadsheet: the template (Name, Email, Role, with made-up people), and a filled-in sheet saved
// as CSV read into the people it adds and the rows it can't. Columns in any order and case; a blank role is Watch only.
import { ROLE_LABELS, type Role } from "../../auth/permissions.ts";
import { csvRows } from "../../shared/csv.ts";
import { isEmail, type NewPerson } from "./members-service.ts";

export const PEOPLE_TEMPLATE_CSV = `Name,Email,Role
Steph's mum,steph.mum@example.com,Watch and film
Jordan's dad,jordan.dad@example.com,Watch only
Coach Kerr,coach.kerr@example.com,Coach
`;

/** The most rows one sheet adds: a squad's families, with room to spare. */
export const MAX_PEOPLE = 200;

const COLUMNS: Record<string, keyof Cells> = {
	name: "name", "full name": "name", who: "name", parent: "name", "parent name": "name", family: "name",
	email: "email", "e-mail": "email", "email address": "email", "e-mail address": "email",
	role: "role", access: "role", permission: "role", "can they": "role",
};
interface Cells { name: string; email: string; role: string }

// Each role as people write it: the site's own names, and the usual other ways (a parent is usually Watch only).
const ROLE_WORDS: Array<[RegExp, Role]> = [
	[/^(team )?manager$|^tm$/, "manager"], [/coach/, "coach"],
	[/film|record|stream|upload/, "filmer"], [/^$|watch|view|parent|family|player|mum|dad|guardian/, "watcher"],
];
const roleOf = (raw: string): Role | null => ROLE_WORDS.find(([words]) => words.test(raw.trim().toLowerCase()))?.[1] ?? null;
const ROLE_LIST = `${Object.values(ROLE_LABELS).slice(0, -1).join(", ")} or ${ROLE_LABELS.manager}`;

export function readPeopleCsv(text: string): { people: NewPerson[]; problems: string[] } {
	const all = csvRows(text, { blanks: true });
	// The header is the first row with anything in it (some sheets start with blank rows); row numbers are the sheet's own.
	const first = Math.max(0, all.findIndex((r) => r.some((c) => c.trim() !== "")));
	const [header = [], ...rows] = all.slice(first);
	const at = new Map<keyof Cells, number>();
	header.forEach((cell, i) => { const key = COLUMNS[cell.trim().toLowerCase()]; if (key && !at.has(key)) at.set(key, i); });
	if (!at.has("email")) return { people: [], problems: ["The sheet has no Email column. Start from the template: its first row is Name, Email, Role."] };
	const people: NewPerson[] = [], problems: string[] = [], seen = new Set<string>();
	rows.forEach((row, i) => {
		if (row.every((c) => c.trim() === "")) return;
		const cell = (k: keyof Cells) => (at.has(k) ? row[at.get(k)!] ?? "" : "").trim();
		// An address as an email shows it ("Steph's mum <steph@example.com>") is the part in angle brackets.
		const name = cell("name"), email = (/<([^<>]+)>\s*$/.exec(cell("email"))?.[1] ?? cell("email")).trim().toLowerCase(), rawRole = cell("role");
		const which = `Row ${first + i + 2}${name ? ` (${name})` : ""}`;
		if (!email) return void problems.push(`${which}: it has no email address.`);
		if (!isEmail(email) || email.length > 254) return void problems.push(`${which}: "${cell("email")}" isn't an email address.`);
		if (name.length > 80) return void problems.push(`${which}: the name is longer than 80 letters. Shorten it on the sheet.`);
		const role = roleOf(rawRole);
		if (!role) return void problems.push(`${which}: the role "${rawRole}" isn't one the site has (${ROLE_LIST}).`);
		if (seen.has(email)) return void problems.push(`${which}: ${email} is on the sheet already, so this row is left out.`);
		if (people.length >= MAX_PEOPLE) return void problems.push(`${which}: a sheet adds ${MAX_PEOPLE} people at most, so this row is left out.`);
		seen.add(email);
		people.push({ email, name, role });
	});
	return { people, problems };
}
