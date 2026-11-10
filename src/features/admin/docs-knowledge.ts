// What the Documentation AI assistant knows: every section of the admin area's Documentation, as plain text, numbered as
// the page numbers them, so its answers change whenever the Documentation does. A table's rows stay rows (cells apart
// with "|"); a diagram is its description and caption, as a screen reader hears it.
import { GROUPS } from "./views/docs-groups.ts";

export interface DocText { id: string; n: number; title: string; text: string }

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** A section's HTML as plain text. */
export function plain(html: string): string {
	return html
		.replace(/<svg[\s\S]*?<desc[^>]*>([\s\S]*?)<\/desc>[\s\S]*?<\/svg>/g, "\n$1\n")
		.replace(/<nav class="docs-pn"[\s\S]*?<\/nav>/g, "")
		.replace(/<\/(td|th)>/g, " | ").replace(/<\/tr>/g, "\n")
		.replace(/<h3[^>]*>/g, "\n\n").replace(/<\/h3>/g, "\n").replace(/<li>/g, "\n- ").replace(/<\/(p|figcaption|ul|table)>/g, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
		.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ")
		.trim();
}

let cached: DocText[] | null = null;

/** Every section, in the page's order (the same for every admin, so worked out once a Worker instance). */
export function docSections(): DocText[] {
	cached ??= GROUPS.flatMap((g) => g.sections.map((s) => s())).map((s, i) => ({ id: s.id, n: i + 1, title: s.title, text: plain(s.body.__html) }));
	return cached;
}
