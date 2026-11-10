// The Documentation page's building blocks: a section with its heading (linked from the contents), and a simple table.
import { html, type SafeHtml } from "../../../shared/html.ts";

export interface DocSection { id: string; title: string; body: SafeHtml }

/** A section, numbered through the page, with the group it sits in as a breadcrumb above its heading. */
export const section = (s: DocSection, group: string, n: number): SafeHtml =>
	html`<section class="panel docsec" id="${s.id}" aria-labelledby="${s.id}-h"><p class="docs-crumb">Documentation › ${group}</p><h2 id="${s.id}-h"><span class="docs-num">${n}.</span> ${s.title}</h2>${s.body}</section>`;

/** A table whose first column names each row. Two columns wrap to a phone's width; three or more scroll sideways inside
 * their own box. */
export const table = (head: string[], rows: Array<Array<string | SafeHtml>>): SafeHtml => html`<div class="tablewrap"><table class="docs-table${head.length > 2 ? " wide" : ""}">
<thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
<tbody>${rows.map(([first, ...rest]) => html`<tr><th scope="row">${first}</th>${rest.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div>`;

/** A name as it appears in Cloudflare or the code. */
export const code = (text: string): SafeHtml => html`<code>${text}</code>`;

/** Commands to type, as a block that scrolls sideways rather than wrapping. */
export const cmd = (text: string): SafeHtml => html`<pre class="docs-cmd"><code>${text}</code></pre>`;
