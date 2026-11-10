// The admin area's Documentation page: the sections in groups, one shown at a time (public/docs.js), with the contents and
// a search box down the left, "On this page" down the right on a wide screen, and each section's neighbours at its foot.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { adminLayout } from "./admin-layout.ts";
import { type DocSection, section } from "./docs-blocks.ts";
import { GROUPS } from "./docs-groups.ts";

/** The Documentation AI assistant (public/docs-ask.js asks it and shows the answer with the sections it used). */
const ASSISTANT = html`<section class="panel docs-ai" aria-labelledby="docs-ai-h"><h2 id="docs-ai-h">Documentation AI assistant</h2>
<p class="small">Ask anything about how the site works or how it's run. It answers from this documentation only, and says which sections it used.</p>
<form id="docs-ai" class="askform"><input type="text" id="docs-ai-q" name="question" maxlength="400" autocomplete="off" aria-label="Your question"><button class="btn primary" type="submit">Ask</button></form>
<div class="docs-ai-a" id="docs-ai-a" aria-live="polite" hidden></div>
<p class="small">An AI reading the sections below, so it can get things wrong: the sections it names are the word to go by.</p></section>`;

const SEARCH_ICON = html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

/** The section, with the way to the one before and the one after at its foot. */
function withNeighbours(all: Array<DocSection & { group: string }>, i: number): SafeHtml {
	const prev = all[i - 1], next = all[i + 1], s = all[i]!;
	const links = html`${prev ? html`<a class="prev" href="#${prev.id}"><small>Previous</small><b>${i}. ${prev.title}</b></a>` : html`<span></span>`}${next ? html`<a class="next" href="#${next.id}"><small>Next</small><b>${i + 2}. ${next.title}</b></a>` : ""}`;
	return section({ ...s, body: html`${s.body}<nav class="docs-pn" aria-label="Neighbouring sections">${links}</nav>` }, s.group, i + 1);
}

export function docsPage(frame: AdminFrame): SafeHtml {
	const groups = GROUPS.map((g) => ({ label: g.label, sections: g.sections.map((s) => ({ ...s(), group: g.label })) }));
	const all = groups.flatMap((g) => g.sections);
	const contents = html`<nav class="docs-toc" aria-label="Contents">
<button class="btn quiet toc-toggle" type="button" aria-expanded="false" aria-controls="toc-list"><span class="toc-now"></span><span>Contents</span></button>
<div class="docs-search">${SEARCH_ICON}<input type="search" id="docs-q" placeholder="Search" aria-label="Search the documentation" autocomplete="off"></div>
<ol class="docs-results" id="docs-results" hidden aria-label="Search results"></ol>
<div id="toc-list"><h2>Contents</h2>${groups.map((g) => html`<section class="toc-group"><h3>${g.label}</h3><ol>${g.sections.map((s) => html`<li><a href="#${s.id}"><span class="num">${all.indexOf(s) + 1}.</span> ${s.title}</a></li>`)}</ol></section>`)}</div></nav>`;
	const outline = html`<aside class="docs-outline" aria-label="On this page" hidden><h2>On this page</h2><ol id="docs-outline"></ol></aside>`;
	return adminLayout({
		title: "Documentation", current: "docs", frame, styles: ["/docs.css"], scripts: ["/docs.js", "/docs-ask.js", "/copy.js"],
		lede: "For the site's admins: what the site is, how it works, how it's set up on Cloudflare and how it's looked after, as it stands today. New here? Begin at Start here.",
	}, html`<div class="docs">${contents}<div class="docs-body">${ASSISTANT}${all.map((_, i) => withNeighbours(all, i))}</div>${outline}</div>`);
}
