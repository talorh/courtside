import { html } from "../../../shared/html.ts";
import { faqItem } from "./faq-item.ts";
import { shot } from "./faq-mock.ts";

/** A coach's own question (each person's own Help): the private notes on a game (notes-panel.ts). */
export const faqCoachNotes = () => faqItem("notes", "Coaches' notes", html`<p>Each game's page has <b>Coaches' notes</b>, on a
clipboard below the video (beside it on a computer). Only coaches see them: not team managers, and not a site admin trying
the site as a coach.</p>
<ol class="steps">
<li>Open the game in <b>Watch games</b>.</li>
<li>To tie a note to a moment, play the video there and tap <b>Mark time</b> (or type the time). Leave it empty for the
whole game.</li>
<li>Write the note and tap <b>Save note</b>.</li></ol>
<p class="small">Tap a note's time to jump the video there. <b>Delete</b> takes one off, after asking. <b>Download for
Excel</b> saves the game's notes as a spreadsheet.</p>
${shot("coach-notes", "Coaches' notes on its clipboard: Coaches only, Add a note with the time, Mark time, the note and Save note, then This game's notes with Download for Excel, and a note at 3:42 with Delete", 358, 1013)}`);
