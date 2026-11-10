// The changelog (CHANGELOG.md at the top of the repo): what changed on the site, newest first, under each local date,
// as release notes: each line a feature, an enhancement or a fix ("- [Fix] **Costs:** Fixed an issue where ..."), its
// area in bold. The page reads it from the build (Vite's ?raw import), so nothing is fetched at run time, and `npm run
// release` sends the newest line, in plain words, as the deploy's message.

export type ChangeKind = "feature" | "enhancement" | "fix";
export const CHANGE_KINDS: readonly ChangeKind[] = ["feature", "enhancement", "fix"];

export interface Change { kind: ChangeKind; area: string | null; text: string }

export interface ChangelogDay {
	/** As written, "23 Oct 2026". */
	date: string;
	changes: Change[];
}

const LINE = /^- \[(Feature|Enhancement|Fix)\] (?:\*\*([^*]+?):\*\* )?(.+)$/;

/** The days and their changes, newest first, as written: "## 23 Oct 2026" headings with "- [Kind] " lines under them.
 * A line without its kind is an enhancement. */
export function parseChangelog(text: string): ChangelogDay[] {
	const days: ChangelogDay[] = [];
	for (const line of text.split("\n")) {
		const heading = /^## (.+)$/.exec(line);
		if (heading) { days.push({ date: heading[1]!.trim(), changes: [] }); continue; }
		if (!line.startsWith("- ") || !days.length) continue;
		const m = LINE.exec(line.trim());
		days.at(-1)!.changes.push(m ? { kind: m[1]!.toLowerCase() as ChangeKind, area: m[2]?.trim() ?? null, text: m[3]!.trim() } : { kind: "enhancement", area: null, text: line.slice(2).trim() });
	}
	return days.filter((d) => d.changes.length > 0);
}

/** A change in plain words: "Costs: Fixed an issue where ...". */
export const plainChange = (c: Change) => (c.area ? `${c.area}: ${c.text}` : c.text);

/** The newest line, in plain words: what the next deploy brings. */
export function newestChange(text: string): string | null {
	const first = parseChangelog(text)[0]?.changes[0];
	return first ? plainChange(first) : null;
}
