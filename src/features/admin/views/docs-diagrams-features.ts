// The Documentation page's diagrams for the members' features: a highlight clip's path, a removal request's, a question
// to Ask Virtual Team Manager, and a team manager's support ticket.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { draw, figure } from "./docs-draw.ts";

export function clipDiagram(): SafeHtml {
	const d = draw("clip");
	const [member, worker, stream, job] = [90, 290, 490, 670];
	return figure("clip", {
		w: 760, h: 320, min: 640, title: "A highlight clip's path",
		desc: "A member marks a start and an end on the game's video with a label; the Worker asks Stream to cut that part as a clip of its own; the 5-minute job asks Stream how it's going, and once it's ready starts its MP4; the clip shows beside the player with the players in it.",
		caption: "A clip is its own video in Stream, deleted with the game's video or by a team manager. Its maker or a team manager can change who's in it.",
	}, html`${d.lane(member, 140, "Member", 300, "person")}${d.lane(worker, 140, "Worker", 300, "worker")}${d.lane(stream, 140, "Stream", 300, "service")}${d.lane(job, 140, "5-minute job", 300, "job")}
${d.message(member, worker, 100, "a start, an end and a label")}
${d.message(worker, stream, 146, "cut it from the game's video")}
${d.message(job, stream, 192, "ready yet?")}
${d.message(stream, job, 238, "ready: its MP4 started")}
${d.message(worker, member, 284, "beside the player, with who's in it")}`);
}

export function removalDiagram(): SafeHtml {
	const d = draw("removal");
	return figure("removal", {
		w: 760, h: 235, min: 640, title: "A removal request's path",
		desc: "Any member asks for a video, clip or photo to be removed, with a reason; the request waits on the team manager's Manage team and shows in Notifications and on the admins' Insights; the team manager deletes it, which closes every open request for it, or keeps it with a note.",
		caption: "Families can always ask; only a team manager decides. A request stays on record even after what it named has gone.",
	}, html`${d.box({ x: 10, y: 30, w: 230, title: "Ask for it to be removed", sub: "a video, clip or photo, any member", kind: "person" })}
${d.box({ x: 265, y: 30, w: 230, title: "Waiting on Manage team", sub: "in Notifications and Insights too", kind: "service" })}
${d.box({ x: 520, y: 30, w: 230, title: "Team manager decides", sub: "the reason beside it", kind: "step" })}
${d.box({ x: 265, y: 140, w: 230, title: "Deleted", sub: "every open request for it closed", kind: "stop" })}
${d.box({ x: 520, y: 140, w: 230, title: "Kept", sub: "the request closed, with a note", kind: "done" })}
${d.arrow([[240, 58], [263, 58]])}${d.arrow([[495, 58], [518, 58]])}
${d.arrow([[635, 86], [635, 138]])}${d.arrow([[590, 86], [590, 112], [380, 112], [380, 138]])}
${d.label(10, 222, "A team manager can also delete a clip or photo straight from its page; whoever added a photo can delete their own.")}`);
}

export function askDiagram(): SafeHtml {
	const d = draw("ask");
	const [member, worker, ai] = [100, 350, 600];
	return figure("ask", {
		w: 700, h: 270, min: 600, title: "A question to Ask Virtual Team Manager",
		desc: "A member asks a question on Help; the Worker counts it against their 20 a day and sends Workers AI their own Help page as text with whether they're on an iPhone, Android or a computer; the model answers from that alone, and the answer is shown; nothing is kept.",
		caption: "It answers only from the asker's own Help page, so it changes whenever Help does, and says to ask the real person when Help doesn't cover it.",
	}, html`${d.lane(member, 140, "Member", 250, "person")}${d.lane(worker, 140, "Worker", 250, "worker")}${d.lane(ai, 140, "Workers AI", 250, "service")}
${d.message(member, worker, 100, "a question, of 20 a day")}
${d.message(worker, ai, 146, "their Help page's text, and their phone")}
${d.message(ai, worker, 192, "a short, plain answer")}
${d.message(worker, member, 238, "the answer; nothing kept")}`);
}

export function ticketDiagram(): SafeHtml {
	const d = draw("ticket");
	return figure("ticket", {
		w: 760, h: 240, min: 640, title: "A support ticket's path",
		desc: "A team manager asks with Contact support; the ticket is saved first and then emailed to the admins; an admin replies on the site or adds a private note, which leaves it waiting on the team manager, who is emailed; their reply goes back to the admins, and a resolved ticket opens again if they reply.",
		caption: "Every email is saved before it's sent, and the 5-minute job sends any that didn't go. Admins' private notes never reach the team manager.",
	}, html`${d.box({ x: 10, y: 30, w: 170, title: "Contact support", sub: "a team manager's question", kind: "person" })}
${d.box({ x: 200, y: 30, w: 170, title: "A ticket, saved", sub: "then emailed to the admins", kind: "store" })}
${d.box({ x: 390, y: 30, w: 170, title: "An admin replies", sub: "or adds a private note", kind: "step" })}
${d.box({ x: 580, y: 30, w: 170, title: "Waiting for you", sub: "the team manager emailed", kind: "service" })}
${d.box({ x: 580, y: 140, w: 170, title: "They reply", sub: "on the ticket's page", kind: "person" })}
${d.box({ x: 200, y: 140, w: 170, title: "Resolved", sub: "a reply opens it again", kind: "done" })}
${d.arrow([[180, 58], [198, 58]])}${d.arrow([[370, 58], [388, 58]])}${d.arrow([[560, 58], [578, 58]])}${d.arrow([[665, 86], [665, 138]])}
${d.arrow([[580, 168], [510, 168], [510, 88]], { label: "back to the admins", at: [518, 124] })}
${d.arrow([[430, 86], [430, 112], [285, 112], [285, 138]], { label: "or resolves it", at: [300, 106] })}`);
}
