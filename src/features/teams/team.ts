// A team: one season's squad, with its code (b12.1), names and status. Overview:
// docs/architecture.md, The data.

export type TeamStatus = "active" | "closed" | "deleted";

export interface Team {
	/** "<code>-<season>": "b12.1-2026". Never shown. */
	id: string;
	/** "b12.1" */
	code: string;
	/** "Saints U12 Boys 12.1" */
	name: string;
	/** 2026 for 2026/27 */
	seasonStart: number;
	/** Who the site tells members to ask ("Sam"), or null for "your team manager". */
	askName: string | null;
	status: TeamStatus;
	closedAt: string | null;
	deleteAfter: string | null;
}

/** A closed team whose delete_after has passed: the 5-minute job is deleting it (jobs/delete-teams.ts), so it can't be
 * reopened or changed. */
export const isBeingDeleted = (team: Pick<Team, "status" | "deleteAfter">, now: Date) =>
	team.status === "closed" && team.deleteAfter !== null && team.deleteAfter <= now.toISOString();
