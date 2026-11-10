// The support desk (ticket queues, with replies on the site): support questions and feature requests, each queue
// filtered by team, owner and words; a ticket, and what an admin does on one (reply, note, take or give it, change its
// status, a feature request's stage, or its type), each back to the ticket.
import { z } from "zod";
import type { AdminRouter } from "../../app/admin-router.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import { listAdmins } from "../../auth/admins-repository.ts";
import { doneMessage, idParam, parseForm } from "../../shared/validation.ts";
import type { TicketKind } from "../support/support-repository.ts";
import { setKind, setStage } from "./feature-requests-service.ts";
import { deskFigures, ticketTeams } from "./desk-figures-repository.ts";
import { getTicket, listMessages, listQueue, type QueueFilters, QUEUE_VIEWS, type QueueView, queueCounts } from "./support-desk-repository.ts";
import { adminWrites, assignTicket, setTicketStatus } from "./support-desk-service.ts";
import { supportQueuePage } from "./views/support-page.ts";
import { TICKET_MESSAGES, ticketPage } from "./views/support-ticket-page.ts";
import { notFound } from "../../app/errors.ts";

// The newest that are shown in a view.
const SHOWN = 100;

const MessageForm = z.object({ body: z.string().max(5000), then: z.enum(["reply", "resolve", "note"]) });
const AssignForm = z.object({ to: z.string().max(254) });
const StatusForm = z.object({ status: z.string().max(20) });
const StageForm = z.object({ stage: z.string().max(20) });
const KindForm = z.object({ kind: z.string().max(20) });

export function supportAdminRoutes(router: AdminRouter): void {
	router.get("/admin/support", async ({ deps, frame, url }) => {
		const p = (k: string) => (url.searchParams.get(k) ?? "").trim().slice(0, 100);
		const kind: TicketKind = p("type") === "feature" ? "feature" : "support";
		const view: QueueView = (QUEUE_VIEWS[kind] as readonly string[]).includes(p("view")) ? p("view") as QueueView : "attention";
		const filters: QueueFilters = { team: p("team"), owner: p("owner").toLowerCase(), q: p("q") };
		const me = frame.viewer.email, now = deps.now();
		const [tickets, counts, support, feature, figures, teams, admins] = await Promise.all([listQueue(deps.db, { kind, view, me, filters }, SHOWN), queueCounts(deps.db, kind, me, filters),
			queueCounts(deps.db, "support", me), queueCounts(deps.db, "feature", me), deskFigures(deps.db, kind, now), ticketTeams(deps.db), listAdmins(deps.db)]);
		return htmlResponse(supportQueuePage({ frame, kind, view, filters, counts, tabs: { support: support.attention, feature: feature.attention }, figures, tickets, teams, admins: admins.map((a) => a.email), now }));
	});
	router.get("/admin/support/:id", async ({ deps, frame, params, url }) => {
		const ticket = await getTicket(deps.db, idParam(params.id, "Ticket"));
		if (!ticket) throw notFound("Ticket");
		const [messages, admins] = await Promise.all([listMessages(deps.db, ticket.id), listAdmins(deps.db)]);
		return htmlResponse(ticketPage({ frame, ticket, messages, admins: admins.map((a) => a.email), message: doneMessage(TICKET_MESSAGES, url) }));
	});
	router.post("/admin/support/:id/message", async ({ req, deps, viewer, params }) => {
		const id = idParam(params.id, "Ticket");
		const { body, then } = await parseForm(req, MessageForm);
		await adminWrites(deps, viewer.email, id, body, then);
		return redirect(`/admin/support/${id}?done=${then === "note" ? "noted" : "sent"}`);
	});
	router.post("/admin/support/:id/assign", async ({ req, deps, viewer, params }) => {
		const id = idParam(params.id, "Ticket");
		const { to } = await parseForm(req, AssignForm);
		await assignTicket(deps, viewer.email, id, to.trim() || null);
		return redirect(`/admin/support/${id}?done=saved`);
	});
	router.post("/admin/support/:id/stage", async ({ req, deps, viewer, params }) => {
		const id = idParam(params.id, "Ticket");
		await setStage(deps, viewer.email, id, (await parseForm(req, StageForm)).stage);
		return redirect(`/admin/support/${id}?done=saved`);
	});
	router.post("/admin/support/:id/type", async ({ req, deps, viewer, params }) => {
		const id = idParam(params.id, "Ticket");
		await setKind(deps, viewer.email, id, (await parseForm(req, KindForm)).kind);
		return redirect(`/admin/support/${id}?done=moved`);
	});
	router.post("/admin/support/:id/status", async ({ req, deps, viewer, params }) => {
		const id = idParam(params.id, "Ticket");
		await setTicketStatus(deps, viewer.email, id, (await parseForm(req, StatusForm)).status);
		return redirect(`/admin/support/${id}?done=saved`);
	});
}
