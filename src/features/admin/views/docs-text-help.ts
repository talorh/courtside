// The Documentation page's section on Help, Ask Virtual Team Manager and team managers' support tickets, as
// src/features/help/ and support/ do them.
import { html } from "../../../shared/html.ts";
import { MODEL } from "../../../platform/workers-ai.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { askDiagram, ticketDiagram } from "./docs-diagrams-features.ts";

export const help = (): DocSection => ({ id: "help", title: "Help, Ask and support", body: html`
<h3>Help</h3>
<p>Help (${code("/help")}, from the Help button on every page) is questions that open when tapped, with a search box
that narrows them as you type. Each person sees only what they do: everyone starts with getting started, then Watch
only gets watching, photos and the roster; Watch and film gets filming first; a coach gets their notes; and a team
manager's Help is in two parts, each named on the page and in the contents: Running your team (their own questions,
ending with removal requests and the support form), then For everyone on the team (everyone's, with child safety last).
Every section reads right for its team: who to ask, its own season's date and its own duties. The pictures of the
site's pages are screenshots taken on staging with test data, and the fiddly steps have mock screens.</p>
<h3>Ask Virtual Team Manager</h3>
<p>Each team's helper is named for its team manager, from the team's own name to ask (Teams): Virtual Sam in B12.1,
or plain Virtual Team Manager in a team with none.</p>
${askDiagram()}
<ul class="docs-points">
<li><b>What it knows:</b> the asker's own Help page as plain text (their role's questions, for their team), so its
answers change whenever Help does, and whether they're on an iPhone, Android or a computer, so it gives the steps for
their phone. Screenshots and mock screens aren't words, so they're left out.</li>
<li><b>The model:</b> Workers AI's ${code(MODEL)}, the site's one model, quick and cheap (it uses 4 billion of its 26
billion parameters an answer), with its thinking turned off so the answer starts straight away, at temperature 0.2 with
up to 350 tokens. The AI models alert says when Cloudflare plans to retire it. It declines anything off-topic and says to ask the team's own
name to ask (or "your team manager") when Help doesn't cover it, and for a team manager it points to the support form.</li>
<li><b>Limits:</b> 20 questions a member a day, counted in ${code("ask_counts")}. The question and the answer are
never stored. If Workers AI isn't answering, it says the helper can't answer just now.</li></ul>
<h3>Support, for team managers</h3>
${ticketDiagram()}
<p>A team manager asks the site's admins with <b>Contact support</b> (the bottom of their Help, and their Support
page), choosing what it's about. Each question is a ticket, answered on the site: the team manager's Support page
lists theirs and where each is at, and a ticket's page shows the conversation, never the admins' private notes. A
ticket works for a closed team too. Five questions and twenty replies a team manager a day at most.</p>
<p><b>Feature requests</b> are a ticket type of their own: Feature request in the form's dropdown. They have their own
queue on Support (a tab beside Support questions), and a stage instead of a status: Under consideration, Planned,
Shipped or Not planned, set on the ticket, each emailed to the team manager. Shipped and Not planned close it; a reply
keeps its stage. A ticket can be moved to the other type (Type, beside it), which starts its stage again.</p>
${table(["The admins see", "The team manager sees", "Meaning"], [
		["New", "Sent", "Nobody's picked it up yet"],
		["Open", "Being looked at", "An admin is on it"],
		["Waiting", "Waiting for you", "An admin replied and is waiting for the team manager"],
		["Resolved", "Resolved", "Done; a reply from the team manager opens it again"],
	])}
<p>Every message is saved before its email goes, to the admins (Reply-To the team manager) or to the team manager
(Reply-To the admin), and the 5-minute job sends any email that didn't go. The site's own monitoring raises tickets on
the same desk (Monitoring and support), and so does the sign-in page's Request access (Signing in): an access request
has nobody to reply to on the site, so an admin adds the person to their team's list and resolves it. The tickets are ${code("support_requests")}, and their conversations
${code("support_messages")}.</p>`});
