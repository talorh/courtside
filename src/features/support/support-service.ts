// A team manager asking the site's admins for help, as a ticket
// (like a service desk, with replies on the site): saved first, then emailed to the admins with a link to the
// ticket and Reply-To the team manager; their replies are saved on the ticket and emailed the same way. An email that
// fails is sent by the 5-minute job; the team manager is told it's sent either way (it's saved, and on the desk).
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest, HttpError, notFound } from "../../app/errors.ts";
import { addDays } from "../../shared/time.ts";
import { trySend } from "../admin/support-desk-service.ts";
import type { Member } from "../members/members-repository.ts";
import {
	ASK_CHOICES, countRepliesSince, countSupportSince, getMyTicket, insertSupport, replyAsManager, type SupportInput, type SupportTopic,
} from "./support-repository.ts";

// At most this many questions from one person in a day, and replies: anything past it is more than a team manager would send.
const PER_DAY = 5;
const REPLIES_PER_DAY = 20;

const tooMany = () => new HttpError(429, "too_many", "That's a lot for one day. We'll get back to you about the others first.");

/** The new ticket's id. */
export async function askForSupport(deps: TeamDeps, member: Member, input: { topic: string; message: string; contact: string }): Promise<number> {
	if (!(ASK_CHOICES as readonly string[]).includes(input.topic)) throw badRequest("Choose what it's about.");
	const message = input.message.trim();
	if (!message || message.length > 2000) throw badRequest("Write your question or idea (up to 2,000 characters).");
	const contact = input.contact.trim();
	if (!contact) throw badRequest("Say how to reach you.");
	const now = deps.now();
	if ((await countSupportSince(deps.db, deps.team.id, member.id, addDays(now, -1).toISOString())) >= PER_DAY) throw tooMany();
	// A feature request is its own type of ticket; what it's about is left as something else.
	const feature = input.topic === "feature";
	const request: SupportInput = { kind: feature ? "feature" : "support", topic: feature ? "other" : input.topic as SupportTopic, message, contact };
	const id = await insertSupport(deps.db, deps.team.id, member.id, request, now.toISOString());
	await trySend(deps, "ticket", id);
	return id;
}

/** The team manager's reply on their own ticket: it opens again, and the admins hear about it. */
export async function replyToTicket(deps: TeamDeps, member: Member, id: number, text: string): Promise<void> {
	if (!(await getMyTicket(deps.db, deps.team.id, member.id, id))) throw notFound("Request");
	const body = text.trim();
	if (!body || body.length > 2000) throw badRequest("Write your reply (up to 2,000 characters).");
	const now = deps.now();
	if ((await countRepliesSince(deps.db, deps.team.id, member.id, addDays(now, -1).toISOString())) >= REPLIES_PER_DAY) throw tooMany();
	await trySend(deps, "message", await replyAsManager(deps.db, deps.team.id, member.id, id, body, now.toISOString()));
}
