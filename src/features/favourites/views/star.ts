import { html, type SafeHtml } from "../../../shared/html.ts";

/**
 * A favourite star: a plain form post, so it works without JavaScript. The label stays "Favourite" and
 * aria-pressed says whether it's on, as a toggle button should.
 */
export const starButton = (action: string, on: boolean, back: string): SafeHtml => html`<form method="post" action="${action}" class="inline">
<input type="hidden" name="on" value="${on ? "0" : "1"}"><input type="hidden" name="back" value="${back}">
<button class="btn star" type="submit" aria-pressed="${on ? "true" : "false"}"><span aria-hidden="true">${on ? "★" : "☆"}</span> Favourite</button></form>`;
