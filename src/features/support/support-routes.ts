import { z } from "zod";
import { HttpError, notFound } from "../../app/errors.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { doneMessage, idParam, parseForm } from "../../shared/validation.ts";
import { getMyTicket, listMyTickets, listPublicReplies } from "./support-repository.ts";
import { askForSupport, replyToTicket } from "./support-service.ts";
import { SUPPORT_MESSAGES, supportPage } from "./views/support-form.ts";
import { myTicketPage } from "./views/support-ticket.ts";

// As long as the form allows (maxlength), plus a little: the service says what's wrong in words.
const SupportForm = z.object({ topic: z.string().max(20), message: z.string().max(4000), contact: z.string().max(400) });
const ReplyForm = z.object({ body: z.string().max(4000) });
const SHOWN = 20;

/** A failure the person can fix (400, 429) is shown on the page they were on; anything else is an error. */
const shown = (err: unknown) => (err instanceof HttpError && err.status < 500 ? err : null);

/** Team managers only ask the site's admins for help, and answer on their own
 * requests (tickets), even once their season is over (closed). */
export function registerSupportRoutes(router: Router): void {
	router.get("/support", "manager", async ({ frame, url, deps, member }) => htmlResponse(supportPage({
		frame, tickets: await listMyTickets(deps.db, deps.team.id, member.id, SHOWN), message: doneMessage(SUPPORT_MESSAGES, url),
	})));
	router.post("/support", "manager", async ({ req, deps, member, frame }) => {
		const values = await parseForm(req, SupportForm);
		try {
			return redirect(`/support/${await askForSupport(deps, member, values)}?done=sent`);
		} catch (err) {
			const e = shown(err);
			if (!e) throw err;
			return htmlResponse(supportPage({ frame, tickets: await listMyTickets(deps.db, deps.team.id, member.id, SHOWN), values, error: e.message }), e.status);
		}
	}, { closedTeams: true });
	router.get("/support/:id", "manager", async ({ params, url, deps, member, frame }) => {
		const ticket = await getMyTicket(deps.db, deps.team.id, member.id, idParam(params.id, "Request"));
		if (!ticket) throw notFound("Request");
		return htmlResponse(myTicketPage({ frame, ticket, replies: await listPublicReplies(deps.db, deps.team.id, ticket.id), message: doneMessage(SUPPORT_MESSAGES, url) }));
	});
	router.post("/support/:id/reply", "manager", async ({ req, params, deps, member, frame }) => {
		const id = idParam(params.id, "Request");
		const { body } = await parseForm(req, ReplyForm);
		try {
			await replyToTicket(deps, member, id, body);
			return redirect(`/support/${id}?done=replied`);
		} catch (err) {
			const e = shown(err);
			const ticket = e && e.status !== 404 ? await getMyTicket(deps.db, deps.team.id, member.id, id) : null;
			if (!e || !ticket) throw err;
			return htmlResponse(myTicketPage({ frame, ticket, replies: await listPublicReplies(deps.db, deps.team.id, id), body, error: e.message }), e.status);
		}
	}, { closedTeams: true });
}
