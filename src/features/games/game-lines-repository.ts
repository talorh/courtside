import type { TeamDeps } from "../../app/deps.ts";
import { adminLogStatement } from "../admin/admin-log-repository.ts";
import { CLUB_LINES } from "./game-lines-club.ts";
import { LINE_GROUPS, LINE_KINDS, type LineKind, type TeamLines } from "./game-lines.ts";

/** The groups the team has changed, its lines for each. */
export async function getGameLines(db: D1Database, teamId: string): Promise<TeamLines> {
	const { results } = await db.prepare("SELECT kind, lines FROM game_lines WHERE team_id = ?").bind(teamId).all<{ kind: LineKind; lines: string }>();
	return Object.fromEntries(results.map((r) => [r.kind, r.lines.split("\n")]));
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

/**
 * Saves each group's checked lines (none: the club's) and the Log line naming the groups that changed, together. A group
 * set to the club's lines keeps no row, so it follows the club's from then on. Returns the groups that changed.
 */
export async function saveGameLines(deps: TeamDeps, actor: string, lines: Record<LineKind, string[]>): Promise<LineKind[]> {
	const { db, team } = deps;
	const before = await getGameLines(db, team.id);
	const nowIso = deps.now().toISOString();
	const own = (kind: LineKind) => (lines[kind].length && !same(lines[kind], CLUB_LINES[kind]) ? lines[kind] : null);
	const changed = LINE_KINDS.filter((kind) => !same(own(kind) ?? CLUB_LINES[kind], before[kind] ?? CLUB_LINES[kind]));
	if (!changed.length) return [];
	await db.batch([
		...changed.map((kind) => {
			const next = own(kind);
			return next
				? db.prepare(`INSERT INTO game_lines (team_id, kind, lines, updated_at) VALUES (?, ?, ?, ?)
					ON CONFLICT (team_id, kind) DO UPDATE SET lines = excluded.lines, updated_at = excluded.updated_at`).bind(team.id, kind, next.join("\n"), nowIso)
				: db.prepare("DELETE FROM game_lines WHERE team_id = ? AND kind = ?").bind(team.id, kind);
		}),
		adminLogStatement(db, { device: deps.device, adminEmail: actor, teamId: team.id, action: "game_lines_changed", detail: changed.map((k) => LINE_GROUPS[k].name).join(", "), at: nowIso }),
	]);
	return changed;
}
