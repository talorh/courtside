import { CLUB } from "../club.ts";
import { html, type SafeHtml } from "../shared/html.ts";
import { layout } from "./layout.ts";

/** The entry card, in the look of the Access page the sign-in replaced: on a
 * A page in the club's deep colour, a white card with the logo and "Courtside" small at the top, the heading, the body, and a grey
 * footer band when there's one. */
export function card(title: string, body: SafeHtml, footer?: string | SafeHtml): SafeHtml {
	return html`<section class="signin"><div class="card"><div class="pad"><div class="brandrow"><img src="/logo.png" alt="" width="40" height="40"><span>${CLUB.siteName}</span></div>
<h1>${title}</h1>${body}</div>${footer ? html`<div class="foot">${footer}</div>` : ""}</div></section>`;
}

/** A page that's no team's and has no app bar (the sign-in, sign out, errors, Which team?): the card alone on the green page. */
export function entryPage(o: { title: string; scripts?: string[]; preview?: boolean }, heading: string, body: SafeHtml, footer?: string | SafeHtml): SafeHtml {
	return layout({ title: o.title, frame: null, bodyClass: "entry", preview: o.preview, ...(o.scripts ? { scripts: o.scripts } : {}) }, card(heading, body, footer));
}

/** A 401 (a page script's call while signed out gets JSON; a page is sent to /signin by handle-request.ts) offers the sign-in page. */
export function errorPage(status: number, message: string): SafeHtml {
	return entryPage({ title: `Error ${status}` }, status === 404 ? "Out of bounds" : "Air ball!", html`
<p>${message}</p><p><a class="btn" href="${status === 401 ? "/signin" : "/"}">${status === 401 ? "Sign in again" : "Back to the start"}</a></p>`);
}
