import { asksAdmin, films, type Role } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import { supportForm } from "../../support/views/support-form.ts";
import { faqButtons, faqComputer, faqKept, faqSignin, faqWatch, faqKeptAboutMe, faqWho } from "./faq-basics.ts";
import { faqDuty } from "./faq-duty.ts";
import { faqInstall } from "./faq-install.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { faqAiCameras } from "./faq-ai-cameras.ts";
import { FAQ_LIVE_BROWSER, faqLiveGame } from "./faq-live.ts";
import { faqCoachNotes } from "./faq-notes.ts";
import { faqPhotos } from "./faq-photos.ts";
import { faqRoster } from "./faq-roster.ts";
import { faqSafety } from "./faq-safety.ts";
import { FAQ_RECORD_ANDROID, FAQ_RECORD_IOS, faqUploadHelp } from "./faq-record.ts";
import { managerFootage, managerRemovals } from "./manager-footage.ts";
import { managerGames } from "./manager-games.ts";
import { managerSeason } from "./manager-season.ts";
import { managerPeople, managerStart } from "./manager-start.ts";

// The answer is filled in by /ask.js as plain text. "The real Sam" where the team has a name to ask.
const ask = ({ c }: HelpFor) => html`<section class="panel ask" aria-labelledby="ask-h"><h2 id="ask-h">Ask ${c.helper}</h2>
<p>Ask anything about using the site.</p>
<form id="ask" class="askform"><input type="text" id="ask-q" name="question" maxlength="300" autocomplete="off"
aria-label="Your question"><button class="btn primary" type="submit">Ask</button></form>
<p class="askanswer" id="ask-a" aria-live="polite" hidden></p>
<p class="small">${c.helper} is an AI that only knows this Help page, so it can get things wrong. If in doubt, ask ${c.ask === c.Ask ? `the real ${c.ask}` : c.ask}.</p></section>`;

// What the site is for, and what it isn't: the last question, after the answers.
const faqAim = () => faqItem("aim", "What is the aim here?", html`
<p>It aims to make it easier to collect videos and photos of the club's games and share them with each team's families and
coaches, while keeping security controls in place to protect footage of children playing sport, without relying on
social media as the primary way of doing this.</p>
<ul class="steps"><li><b>Private:</b> only people who have been given access can sign in, using a code sent to their
email.</li>
<li><b>Not public:</b> nothing is posted to social media.</li>
<li><b>Not kept forever:</b> videos and photos are deleted automatically at the end of the season's year, and any family
can ask for a video, clip or photo to be removed.</li></ul>
<p>What it isn't trying to do:</p>
<ul class="steps"><li><b>Not the team chat:</b> WhatsApp or similar is the main way teams talk.</li>
<li><b>Not game analysis:</b> coaches may wish to use Superstat (superstat.com.au) or similar.</li>
<li><b>Not live scores or player stats:</b> live scores, each player's own points, fouls and games, the ladder and the results history are on the league's own scoring app, which has the full fixtures too.</li></ul>
<p><b>Open source, not for profit:</b> this site runs Courtside, which is open source: anyone can read its code or run it
for their own club, at <a href="https://github.com/talorh/courtside" target="_blank" rel="noopener">github.com/talorh/courtside</a>. There's no desire to make money from any of it: no ads, and nothing is sold.</p>`);

// Recording and live streaming: for those who film (everyone but Watch only).
const filming = (h: HelpFor) => html`${faqDuty(h)}${FAQ_RECORD_IOS}${FAQ_RECORD_ANDROID}${faqUploadHelp(h)}<h3 class="faqsub">Live streaming</h3>${faqLiveGame(h)}${FAQ_LIVE_BROWSER}${faqAiCameras(h)}`;

/** One of Help's sections: its id (h- so it never clashes with a question's), its heading (none when its own
 * questions have their headings, as a team manager's do) and its questions. */
interface HelpGroup { id: string; title?: string; body: SafeHtml; part?: Part }

/** A team manager's Help comes in two parts: running the team, then what everyone on it does. */
const PARTS = { team: "Running your team", all: "For everyone on the team" } as const;
type Part = keyof typeof PARTS;

/** Each role's sections (only the help that's relevant to that person): Getting started first for
 * everyone, then a team manager's own, then filming for those who film, what everyone watches, a
 * coach's notes, photos, the roster for the families on it, child safety and the site's aim; a team manager's clips,
 * photos and removal requests come after the aim, then their child safety. Watch only people don't film, so they never get
 * the video duty checklist. */
function groups(h: HelpFor, role: Role): HelpGroup[] {
	const manager = role === "manager", part: Part | undefined = manager ? "all" : undefined;
	const safety: HelpGroup = { id: "h-safety", title: "Child safety", body: faqSafety(), part };
	const all: Array<HelpGroup | false> = [
		// A team manager's own sections first, as a part of their own.
		manager && { id: "h-team", body: html`${managerStart()}${managerPeople()}${managerGames(h)}${managerFootage(h)}${managerSeason(h)}`, part: "team" },
		manager && { id: "h-removals", body: managerRemovals(), part: "team" },
		{ id: "h-start", title: "Getting started", body: html`${faqSignin(h)}${faqInstall(h, role)}${faqComputer()}${faqWho(h)}${faqKeptAboutMe(h)}${role === "watcher" ? faqButtons(h) : ""}`, part },
		films(role) && { id: "h-filming", title: "Filming a game", body: filming(h), part },
		{ id: "h-watching", title: "Watching", body: html`${faqWatch(h)}${faqKept(h)}`, part },
		role === "coach" && { id: "h-coaches", title: "Coaches", body: faqCoachNotes() },
		{ id: "h-photos", title: "Photos", body: faqPhotos(h), part },
		role !== "coach" && { id: "h-roster", title: "The roster", body: faqRoster(h, films(role)), part },
		// Everyone else's child safety comes before the aim; a team manager's ends their part.
		!manager && safety,
		{ id: "h-about", title: "About this site", body: faqAim(), part },
		manager && safety,
	];
	return all.filter((g): g is HelpGroup => g !== false);
}

// A section's own heading is `gtitle`: it goes with its section, while the headings inside one go with their questions
// (help-search.js).
const group = (g: HelpGroup) => html`<section class="helpgroup" id="${g.id}">${g.title ? html`<h2 class="faqgroup gtitle">${g.title}</h2>` : ""}${g.body}</section>`;

/** Every section the role sees, in page order, for the team (its names, who to ask, its season and
 * duties). Virtual Team Manager reads the same as the person asking (help-knowledge.ts). */
export function helpSections(h: HelpFor, role: Role, teamEnd: SafeHtml | "" = ""): SafeHtml {
	const gs = groups(h, role);
	if (role !== "manager") return html`${gs.map(group)}\n<p class="small">Still stuck? Ask ${h.c.ask}.</p>`;
	// Each part under its own heading (help-desk.js puts it in the contents); `teamEnd` (the support form) ends the first.
	const part = (p: Part, end: SafeHtml | "") => html`<div class="helppart" data-part="${PARTS[p]}"><h2 class="partname">${PARTS[p]}</h2>${gs.filter((g) => g.part === p).map(group)}${end}</div>`;
	return html`${part("team", teamEnd)}${part("all", "")}`;
}

const SEARCH_ICON = html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

// On a computer Help is laid out as the admin area's Documentation (public/help-desk.js fills these; desktop.css shows
// them): the contents and a search down the left, one section at a time in the middle with cards to the sections either
// side, and On this page down the right. On a phone they never show, and .helpmain's box is display: contents, so the
// page is exactly as it was.
const DESK_TOC = html`<nav class="helptoc" aria-label="Help contents"><div class="helptoc-search">${SEARCH_ICON}<input type="search" id="helptoc-q" placeholder="Search Help" aria-label="Search Help" autocomplete="off"></div>
<p class="helptoc-h">Contents</p><ol id="helptoc-list"></ol></nav>`;
const DESK_OUTLINE = html`<aside class="helpoutline" aria-label="On this page"><p class="helptoc-h">On this page</p><ol id="help-outline"></ol></aside>`;

/**
 * Help: plain-English help, each person only what they do, found by a search box that narrows the questions
 * (help-search.js), and for a team manager everything they do, ending in the form to ask the
 * site's admin.
 */
export function helpPage(frame: PageFrame, h: HelpFor): SafeHtml {
	const role = frame.member.role;
	const tools = html`<div class="helptools"><input type="search" id="help-search" placeholder="Search Help" aria-label="Search Help" autocomplete="off" hidden>
<p class="small" id="help-hint">Tap a question to open it.</p><p class="small" id="help-none" role="status" hidden>No questions match: try fewer words, or ask ${h.c.helper} above.</p></div>`;
	const support = asksAdmin(role) ? html`<h2 class="faqgroup" id="ask-admin">Contact support</h2>${supportForm(frame)}` : "";
	return layout({ title: "Help", frame, current: "help", scripts: ["/ask.js", "/help-search.js", "/help-desk.js"] }, html`<div class="helppage">${DESK_TOC}<div class="helpmain">${pageHead("Questions and how-tos", "Help")}${ask(h)}
${tools}${helpSections(h, role, support)}<nav class="help-pn" aria-label="Neighbouring sections"></nav></div>${DESK_OUTLINE}</div>`);
}
