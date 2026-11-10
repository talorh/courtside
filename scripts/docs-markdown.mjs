// The admin area's Documentation as Markdown (docs/admin/, for reading on GitHub): each section's HTML, as the site
// draws it, turned into plain Markdown. The HTML comes from a few building blocks (docs-blocks.ts: paragraphs, lists,
// tables, commands, code, bold) and the diagrams (docs-draw.ts), so a small converter covers it. Tested in
// tests/features/admin/docs-export.test.ts, which also holds the files on disk to the current text.

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const text = (html) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
/** Inline markup: bold, code and links; everything else is stripped. */
function inline(html) {
	return decode(html
		.replace(/<code>([\s\S]*?)<\/code>/g, (_, c) => `\`${c.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")}\``)
		.replace(/<b>([\s\S]*?)<\/b>/g, "**$1**")
		.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
		.replace(/<br\s*\/?>/g, " ")
		.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
function tableRows(html) {
	const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => inline(c[1]).replace(/\|/g, "\\|")));
	if (!rows.length) return "";
	const [head, ...body] = rows;
	return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
/** One section's body as Markdown. */
export function sectionMarkdown(html) {
	const out = [];
	// Diagrams: their title, description and caption stand in for the picture.
	html = html.replace(/<figure class="dg">([\s\S]*?)<\/figure>/g, (_, f) => {
		const title = text(/<title[^>]*>([\s\S]*?)<\/title>/.exec(f)?.[1] ?? ""), desc = text(/<desc[^>]*>([\s\S]*?)<\/desc>/.exec(f)?.[1] ?? "");
		const caption = text(/<figcaption>([\s\S]*?)<\/figcaption>/.exec(f)?.[1] ?? "");
		return `<p>DIAGRAM:**${title}.** ${desc}${caption ? ` ${caption}` : ""}</p>`;
	});
	html = html.replace(/<div class="docs-copy">[\s\S]*?<\/div>/g, "");
	const blocks = html.match(/<pre(?:\s[^>]*)?><code>[\s\S]*?<\/code><\/pre>|<h3>[\s\S]*?<\/h3>|<p(?:\s[^>]*)?>[\s\S]*?<\/p>|<ul(?:\s[^>]*)?>[\s\S]*?<\/ul>|<ol(?:\s[^>]*)?>[\s\S]*?<\/ol>|<div class="tablewrap">[\s\S]*?<\/table><\/div>/g) ?? [];
	for (const b of blocks) {
		if (b.startsWith("<h3>")) out.push(`### ${inline(b)}`);
		else if (b.startsWith("<ul") || b.startsWith("<ol")) {
			const items = [...b.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => inline(m[1]));
			out.push(items.map((it, i) => (b.startsWith("<ol") ? `${i + 1}. ${it}` : `- ${it}`)).join("\n"));
		} else if (b.startsWith("<div class=\"tablewrap\">")) out.push(tableRows(b));
		else if (b.startsWith("<pre")) out.push(`\`\`\`\n${decode(b.replace(/<[^>]+>/g, "")).trimEnd()}\n\`\`\``);
		else {
			const p = inline(b);
			out.push(p.startsWith("DIAGRAM:") ? `> ${p.slice(8)}` : p);
		}
	}
	return out.filter(Boolean).join("\n\n");
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** The files: an index and one Markdown file per section, numbered as the page numbers them. */
export function docsFiles(groups, siteName) {
	const files = new Map();
	const index = [`# ${siteName}: the admin area's Documentation`, "",
		"The same text the site's admins read at `/admin/docs`, exported by `npm run docs` so it can be read here. Diagrams are",
		"described in words; the site draws them. A change to the Documentation regenerates these files in the same commit.", ""];
	let n = 0;
	for (const group of groups) {
		index.push(`## ${group.label}`, "");
		for (const make of group.sections) {
			const s = make();
			n++;
			const name = `${String(n).padStart(2, "0")}-${slug(s.title)}.md`;
			index.push(`${n}. [${s.title}](${name})`);
			files.set(name, `# ${n}. ${s.title}\n\n*${siteName} Documentation › ${group.label}. [Contents](README.md).*\n\n${sectionMarkdown(s.body.__html)}\n`);
		}
		index.push("");
	}
	files.set("README.md", `${index.join("\n").trimEnd()}\n`);
	return files;
}
