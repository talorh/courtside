// Feature requests on the desk: an admin sets where one stands (considering, planned, shipped or not planned), which
// the team manager is told by email and sees on their Support page; shipped and not planned close it, and the others
// leave the next word to the team manager. A ticket can move between the two types (a question that's really an
// idea, or the other way), which starts its stage again; the site's own tickets are always support.
import type { AppDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { FEATURE_STAGES, type FeatureStage, type TicketKind } from "../support/support-repository.ts";
import { adminLogStatement } from "./admin-log-repository.ts";
import { messageStatement, stageStatement, ticketStatement } from "./support-desk-repository.ts";
import { ticketOr404, trySend } from "./support-desk-service.ts";

export const STAGE_WORDS: Record<FeatureStage, string> = { considering: "under consideration", planned: "planned", shipped: "shipped", declined: "not planned" };

export async function setStage(deps: AppDeps, admin: string, id: number, stage: string): Promise<void> {
	if (!(FEATURE_STAGES as readonly string[]).includes(stage)) throw badRequest("Choose under consideration, planned, shipped or not planned.");
	const t = await ticketOr404(deps, id), to = stage as FeatureStage;
	if (t.kind !== "feature") throw badRequest("Only a feature request has a stage: move it to feature requests first.");
	if (t.stage === to) return;
	const nowIso = deps.now().toISOString(), db = deps.db, closes = to === "shipped" || to === "declined";
	const [, , event] = await db.batch([
		ticketStatement(db, id, { status: closes ? "resolved" : "waiting", assignedTo: t.assignedTo ?? admin, by: admin, nowIso }),
		stageStatement(db, id, "feature", to, nowIso),
		messageStatement(db, { ticket: t, kind: "event", adminEmail: admin, body: `${admin} marked it ${STAGE_WORDS[to]}.`, emailTo: t.source === "team" ? "manager" : null, nowIso }),
		adminLogStatement(db, { device: deps.device, adminEmail: admin, teamId: t.teamId, action: "support_status", detail: `#${id} ${to}`, at: nowIso }),
	]);
	if (t.source === "team") await trySend(deps, "message", event?.meta.last_row_id ?? 0);
}

const KIND_WORDS: Record<TicketKind, string> = { support: "support questions", feature: "feature requests" };

export async function setKind(deps: AppDeps, admin: string, id: number, kind: string): Promise<void> {
	if (kind !== "support" && kind !== "feature") throw badRequest("Choose a support question or a feature request.");
	const t = await ticketOr404(deps, id);
	if (t.source !== "team") throw badRequest("The site's own tickets are always support questions.");
	if (t.kind === kind) return;
	const nowIso = deps.now().toISOString(), db = deps.db;
	// A closed one stays closed; one waiting on a stage needs an answer again as the other type.
	const status = t.status === "resolved" ? "resolved" : t.status === "new" ? "new" : "open";
	await db.batch([
		ticketStatement(db, id, { status, assignedTo: t.assignedTo, by: admin, nowIso }),
		stageStatement(db, id, kind, null, nowIso),
		messageStatement(db, { ticket: t, kind: "event", adminEmail: admin, body: `${admin} moved it to ${KIND_WORDS[kind]}.`, emailTo: null, nowIso }),
		adminLogStatement(db, { device: deps.device, adminEmail: admin, teamId: t.teamId, action: "support_status", detail: `#${id} moved to ${KIND_WORDS[kind]}`, at: nowIso }),
	]);
}
