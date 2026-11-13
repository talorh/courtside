// A sign-in code Email Sending wouldn't send, because the address is on its suppression list (its emails bounced, or
// its owner marked one as spam): the site's admins get a ticket, emailed to them like every ticket, to give the person
// another address. One open ticket an address, however often they try.
import type { AppDeps } from "../../app/deps.ts";
import { trySend } from "../admin/support-desk-service.ts";
import { insertBouncedTicket } from "./bounced-repository.ts";

export async function reportBounced(deps: AppDeps, email: string): Promise<void> {
	const id = await insertBouncedTicket(deps.db, {
		email, title: `Emails to ${email} are bouncing`, nowIso: deps.now().toISOString(),
		message: `A sign-in code couldn't be emailed to ${email}. Cloudflare Email Sending has stopped sending to that address `
			+ "because emails to it bounced, or its owner marked one as spam, so they can't sign in.\n\n"
			+ "To let them in, ask them for another email address and add it to their team's list (Teams, open the team, Manage team). "
			+ "A short bounce (a full inbox, or a mail service holding back new senders) lifts by itself within a day; to lift it "
			+ "sooner, remove the address from Email Sending's suppression list in the Cloudflare dashboard. Then resolve this ticket.",
	});
	if (id === null) return;
	console.log(JSON.stringify({ event: "bounced_reported", teamId: null, ticket: id }));
	await trySend(deps, "ticket", id);
}
