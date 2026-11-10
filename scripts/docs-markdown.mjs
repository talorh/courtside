// The admin area's Documentation as Markdown (docs/admin/, for reading on GitHub): each section's HTML, as the site
// draws it, turned into plain Markdown, and each diagram into its own SVG file beside it with the page's styles inside
// it, so GitHub shows the picture the site shows. The HTML comes from a few building blocks (docs-blocks.ts) and the
// diagrams (docs-draw.ts), so a small converter covers it. Tested in tests/features/admin/docs-export.test.ts, which
// also holds the files on disk to the current text.

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

// The page's neutral colours (public/app.css, light), under the club's own (src/club.ts).
const NEUTRALS = { "--surface": "#FFFFFF", "--line": "#E1E5E2", "--fg": "#121513", "--muted": "#5D6862", "--bg": "#F6F7F6", "--warn-soft": "#FFF4D6", "--warn-ink": "#7A5800", "--live": "#D9262C", "--body": "system-ui, -apple-system, 'Segoe UI', sans-serif" };
/** The diagram rules from public/docs.css (those on .dg and .k- classes), with every token written out, for a standalone SVG. */
export function diagramStyle(docsCss, colors) {
	const tokens = { ...NEUTRALS, "--bar": colors.bar, "--club": colors.button, "--club-soft": colors.soft };
	const rules = docsCss.split("\n").filter((l) => /^\.(dg|k-)/.test(l) && !/^\.dg\{|^\.dgscroll|^\.dg svg|^\.dg-w\d|^\.dg figcaption/.test(l));
	return rules.join("\n").replace(/var\((--[\w-]+)\)/g, (_, name) => tokens[name] ?? "currentColor");
}
/** One figure's SVG as a file of its own: the root gets the dg class the styles hang off, a white ground, and the styles. */
export function diagramSvg(figure, style) {
	const svg = /<svg[\s\S]*?<\/svg>/.exec(figure)?.[0] ?? "";
	const w = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
	return svg
		.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ')
		.replace(/ class="dg-w\d+"/, ' class="dg"')
		.replace(/>/, `>\n<style>${style}</style>\n<rect width="${w?.[1] ?? "100%"}" height="${w?.[2] ?? "100%"}" fill="#FFFFFF"/>`) + "\n";
}

/** One section's body as Markdown. `figures`: where its diagrams go ({ dir, prefix, style, files }), each an SVG file. */
export function sectionMarkdown(html, figures = null) {
	const out = [];
	let n = 0;
	html = html.replace(/<figure class="dg">([\s\S]*?)<\/figure>/g, (_, f) => {
		const title = text(/<title[^>]*>([\s\S]*?)<\/title>/.exec(f)?.[1] ?? ""), desc = text(/<desc[^>]*>([\s\S]*?)<\/desc>/.exec(f)?.[1] ?? "");
		const caption = text(/<figcaption>([\s\S]*?)<\/figcaption>/.exec(f)?.[1] ?? "");
		if (!figures) return `<p>DIAGRAM:> **${title}.** ${desc}${caption ? ` ${caption}` : ""}</p>`;
		const name = `${figures.dir}/${figures.prefix}-${++n}.svg`;
		figures.files.set(name, diagramSvg(f, figures.style));
		return `<p>DIAGRAM:![${title}](${name})\n\n*${caption || desc}*</p>`;
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
		else if (b.startsWith("<p>DIAGRAM:")) out.push(decode(b.slice(11, -4)));
		else out.push(inline(b));
	}
	return out.filter(Boolean).join("\n\n");
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** The files: an index, one Markdown file per section, numbered as the page numbers them, and the diagrams as SVGs
 * under diagrams/. `docsCss` and `colors` style the diagrams (public/docs.css and the club's light colours). */
export function docsFiles(groups, siteName, docsCss, colors) {
	const files = new Map();
	const style = diagramStyle(docsCss, colors);
	const index = [`# ${siteName}: the admin area's Documentation`, "",
		"The same text the site's admins read at `/admin/docs`, exported by `npm run docs` so it can be read here, its",
		"diagrams beside it. A change to the Documentation regenerates these files in the same commit.", ""];
	let n = 0;
	for (const group of groups) {
		index.push(`## ${group.label}`, "");
		for (const make of group.sections) {
			const s = make();
			n++;
			const prefix = String(n).padStart(2, "0");
			const name = `${prefix}-${slug(s.title)}.md`;
			index.push(`${n}. [${s.title}](${name})`);
			const body = sectionMarkdown(s.body.__html, { dir: "diagrams", prefix, style, files });
			files.set(name, `# ${n}. ${s.title}\n\n*${siteName} Documentation › ${group.label}. [Contents](README.md).*\n\n${body}\n`);
		}
		index.push("");
	}
	files.set("README.md", `${index.join("\n").trimEnd()}\n`);
	return files;
}
