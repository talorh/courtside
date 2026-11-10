// The Documentation's search: every section's title, headings and paragraphs, tables and captions are the index, read
// off the page once. Results list where the words appear; choosing one opens that section and goes to the place.
// A plural finds its singular too (search-words.js). "/" puts the cursor in the box; Escape clears it.
import { firstAt, hasEvery, marker } from "./search-words.js";

const MAX_RESULTS = 12;
const BLOCKS = "h3, p, li, tr, figcaption";

export function search(docs, sections, { show, nav, landOn }) {
	const box = document.getElementById("docs-q"), results = document.getElementById("docs-results"), list = document.getElementById("toc-list");
	const index = sections.flatMap((sec) => {
		const title = sec.querySelector("h2").textContent;
		const blocks = [...sec.querySelectorAll(BLOCKS)].filter((el) => !el.closest(".docs-pn, .docs-crumb") && el.textContent.trim());
		return [{ sec, title, el: sec, text: title, heading: "" }, ...blocks.map((el) => ({
			sec, title, el, text: textOf(el), heading: el.matches("h3") ? el.textContent : headingBefore(el),
		}))];
	});

	/** A block's words; a table row's cells are joined with a colon, as a reader would say them. */
	function textOf(el) {
		const parts = el.matches("tr") ? [...el.children].map((c) => c.textContent) : [el.textContent];
		return parts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).join(": ");
	}

	/** The heading above a block, if any. */
	function headingBefore(el) {
		for (let n = el.closest(".docsec > *"); n; n = n.previousElementSibling) if (n.matches("h3")) return n.textContent;
		return "";
	}

	/** The text around the first match, with every matching word marked. */
	function snippet(text, words) {
		const at = Math.max(0, firstAt(text.toLowerCase(), words) - 40);
		const cut = (at > 0 ? "…" : "") + text.slice(at, at + 160) + (at + 160 < text.length ? "…" : "");
		const frag = document.createDocumentFragment();
		let last = 0;
		for (const m of cut.matchAll(marker(words))) {
			frag.append(cut.slice(last, m.index));
			const mark = document.createElement("mark");
			mark.textContent = m[0];
			frag.append(mark);
			last = m.index + m[0].length;
		}
		frag.append(cut.slice(last));
		return frag;
	}

	function go(hit) {
		box.value = "";
		results.hidden = true;
		list.hidden = false;
		const place = hit.el === hit.sec ? null : hit.el;
		// Another section: the change of address shows it, then lands on the place. The same one: straight there.
		if (location.hash !== `#${hit.sec.id}`) { nav.target = place ?? hit.sec; location.hash = hit.sec.id; return; }
		show();
		if (place) landOn(place); else docs.scrollIntoView();
	}

	function run() {
		const words = box.value.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
		if (words.length === 0) { results.hidden = true; list.hidden = false; return; }
		// Every word in the one block; a section's title first, then headings, then the rest, in page order.
		const hits = index.filter((h) => hasEvery(h.text, words));
		const rank = (h) => (h.el === h.sec ? 0 : h.el.matches("h3") ? 1 : 2);
		hits.sort((a, b) => rank(a) - rank(b));
		results.replaceChildren(...hits.slice(0, MAX_RESULTS).map((h) => {
			const li = document.createElement("li"), b = document.createElement("button"), where = document.createElement("b"), what = document.createElement("span");
			b.type = "button";
			where.textContent = h.heading && h.heading !== h.text ? `${h.title} › ${h.heading}` : h.title;
			what.append(snippet(h.text, words));
			b.append(where, what);
			b.addEventListener("click", () => go(h));
			li.append(b);
			return li;
		}));
		if (hits.length === 0) {
			const li = document.createElement("li");
			li.className = "none";
			li.textContent = "Nothing matches. Try another word.";
			results.replaceChildren(li);
		}
		results.hidden = false;
		list.hidden = true;
	}

	box.addEventListener("input", run);
	box.addEventListener("keydown", (e) => { if (e.key === "Escape") { box.value = ""; run(); } });
	addEventListener("keydown", (e) => {
		if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "")) { e.preventDefault(); box.focus(); }
	});
}
