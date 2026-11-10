// Where one of a team manager's tickets stands, as they see it: a support question by its status, a feature request by
// its stage (or Sent, until an admin has looked at it); its name, and what that means.
import type { FeatureStage, MyTicket, TicketStatus } from "../support-repository.ts";
import { TOPIC_LABELS } from "../support-repository.ts";

/** Where a question is at, as whoever asked sees it. */
export const MY_STATUS: Record<TicketStatus, string> = { new: "Sent", open: "Being looked at", waiting: "Waiting for you", resolved: "Resolved" };
export const MY_STAGE: Record<FeatureStage, string> = { considering: "Under consideration", planned: "Planned", shipped: "Shipped", declined: "Not planned" };

// After the status itself, what it means.
const STATUS_MEANS: Record<TicketStatus, string> = {
	new: "Waiting for the site's admin to pick it up.", open: "The site's admin is on it.",
	waiting: "The site's admin is waiting for your answer.", resolved: "If there's more, reply below and it opens again.",
};
const STAGE_MEANS: Record<FeatureStage, string> = {
	considering: "The site's admin is thinking it over.", planned: "It's planned. The site's admin will say here when it's on the site.",
	shipped: "It's on the site now. If something's not right, reply below.", declined: "It isn't planned for now. If there's more to say, reply below.",
};

export function standing(t: MyTicket): { cls: string; label: string; means: string; name: string } {
	if (t.kind === "feature") {
		const name = "Feature request";
		return t.stage ? { cls: t.stage, label: MY_STAGE[t.stage], means: STAGE_MEANS[t.stage], name } : { cls: "new", label: "Sent", means: "Waiting for the site's admin to look at it.", name };
	}
	return { cls: t.status, label: MY_STATUS[t.status], means: STATUS_MEANS[t.status], name: TOPIC_LABELS[t.topic] };
}
