// The Documentation page's diagrams: plain SVG drawn on the server, coloured only by classes (public/docs.css), so they
// follow light and dark mode and need no inline style (the CSP). Each diagram has its own arrowhead id, as several sit on
// one page.
import { html, type SafeHtml } from "../../../shared/html.ts";

/** What a box stands for, which sets its colour: a person, the edge, the Worker, a store of data, another Cloudflare
 * service, a job, a step, or an outcome that stops (refused) or ends well. */
export type BoxKind = "person" | "edge" | "worker" | "store" | "service" | "job" | "step" | "stop" | "done";

export interface Box { x: number; y: number; w: number; h?: number; title: string; sub?: string; kind: BoxKind }

export interface Diagram {
	box(b: Box): SafeHtml;
	/** A line through the points, with an arrowhead at the end. `dashed`: the browser going straight to storage. */
	arrow(points: Array<[number, number]>, o?: { dashed?: boolean; label?: string; at?: [number, number]; both?: boolean }): SafeHtml;
	/** A dashed area with its name at the top left (a Cloudflare account, a loop). */
	zone(x: number, y: number, w: number, h: number, label: string): SafeHtml;
	/** A free label, left-aligned unless `middle`. */
	label(x: number, y: number, text: string, middle?: boolean): SafeHtml;
	/** A sequence diagram's column: its heading box and a dashed line down to `bottom`. */
	lane(cx: number, w: number, title: string, bottom: number, kind?: BoxKind): SafeHtml;
	/** A sequence diagram's message from one column to another, its words above the line. */
	message(from: number, to: number, y: number, text: string, dashed?: boolean): SafeHtml;
}

export function draw(id: string): Diagram {
	const head = `url(#ah-${id})`;
	return {
		box: ({ x, y, w, h = 56, title, sub, kind }) => {
			const cx = x + w / 2;
			const ty = sub ? y + h / 2 - 3 : y + h / 2 + 5;
			return html`<g class="dg-box k-${kind}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
<text class="dg-t" x="${cx}" y="${ty}">${title}</text>${sub ? html`<text class="dg-s" x="${cx}" y="${ty + 17}">${sub}</text>` : ""}</g>`;
		},
		arrow: (points, o = {}) => {
			const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
			const label = o.label && o.at ? html`<text class="dg-label" x="${o.at[0]}" y="${o.at[1]}">${o.label}</text>` : "";
			return html`<path class="dg-arrow${o.dashed ? " dash" : ""}" d="${d}" marker-end="${head}"${o.both ? html` marker-start="${head}"` : ""}/>${label}`;
		},
		zone: (x, y, w, h, label) => html`<g class="dg-zone"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/><text x="${x + 14}" y="${y + 20}">${label}</text></g>`,
		label: (x, y, text, middle = false) => html`<text class="dg-label${middle ? " mid" : ""}" x="${x}" y="${y}">${text}</text>`,
		lane: (cx, w, title, bottom, kind = "service") => html`<line class="dg-life" x1="${cx}" y1="60" x2="${cx}" y2="${bottom}"/>
<g class="dg-box k-${kind}"><rect x="${cx - w / 2}" y="14" width="${w}" height="44" rx="10"/><text class="dg-t" x="${cx}" y="41">${title}</text></g>`,
		message: (from, to, y, text, dashed = false) => {
			const gap = from < to ? 4 : -4;
			return html`<path class="dg-arrow${dashed ? " dash" : ""}" d="M${from + gap} ${y} L${to - gap} ${y}" marker-end="${head}"/>
<text class="dg-label mid" x="${(from + to) / 2}" y="${y - 8}">${text}</text>`;
		},
	};
}

/** The whole figure: the SVG (scrolling sideways inside its own box on a narrow phone), a title and description for a
 * screen reader, the arrowhead, and a caption under it. */
export function figure(id: string, o: { w: number; h: number; title: string; desc: string; caption: string; min?: number }, body: SafeHtml): SafeHtml {
	return html`<figure class="dg"><div class="dgscroll"><svg viewBox="0 0 ${o.w} ${o.h}" width="${o.w}" height="${o.h}" role="img" aria-labelledby="dg-${id}-t dg-${id}-d" class="dg-w${o.min ?? 600}">
<title id="dg-${id}-t">${o.title}</title><desc id="dg-${id}-d">${o.desc}</desc>
<defs><marker id="ah-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="dg-head" d="M0 0L10 5L0 10z"/></marker></defs>
${body}</svg></div><figcaption>${o.caption}</figcaption></figure>`;
}
