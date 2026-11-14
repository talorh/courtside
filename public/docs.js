// The admin area's Documentation: one section at a time, chosen from the contents (the address's #part); the search box
// (docs-search.js); "On this page" for the section's headings on a wide screen; on a phone the contents fold behind a
// button. Without this script, or when printing, every section is on the page as it's drawn.
import { search } from "./docs-search.js";

const docs = document.querySelector(".docs");
if (docs) setup(docs);
function setup(docs) {
	const toc = docs.querySelector(".docs-toc"), toggle = toc.querySelector(".toc-toggle"), now = toc.querySelector(".toc-now");
	const links = [...toc.querySelectorAll("#toc-list a[href^='#']")], sections = [...docs.querySelectorAll(".docsec")];
	const outline = docs.querySelector(".docs-outline"), outlineList = document.getElementById("docs-outline");
	const ids = new Set(sections.map((s) => s.id));
	docs.classList.add("js", "one");
	// Each heading inside a section gets an address, for On this page and the search.
	for (const s of sections) s.querySelectorAll("h3").forEach((h, i) => { h.id ||= `${s.id}-${i + 1}`; });

	const close = () => { toc.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); };

	let watching = null;
	/** On this page: the current section's headings, the one on screen marked. */
	function fillOutline(sec) {
		const heads = [...sec.querySelectorAll("h3")];
		outline.hidden = heads.length < 2;
		outlineList.replaceChildren(...heads.map((h) => {
			const li = document.createElement("li"), a = document.createElement("a");
			a.href = `#${h.id}`;
			a.textContent = h.textContent;
			a.addEventListener("click", (e) => { e.preventDefault(); h.scrollIntoView({ behavior: "smooth", block: "start" }); });
			li.append(a);
			return li;
		}));
		watching?.disconnect();
		watching = new IntersectionObserver((entries) => {
			const seen = entries.find((e) => e.isIntersecting);
			if (!seen) return;
			for (const a of outlineList.querySelectorAll("a")) a.classList.toggle("on", a.getAttribute("href") === `#${seen.target.id}`);
		}, { rootMargin: "-10% 0px -70% 0px" });
		heads.forEach((h) => watching.observe(h));
	}

	// No part named: the first section. A section's name, or one of its headings': that section.
	function show() {
		const id = location.hash.slice(1);
		const owner = id && !ids.has(id) ? document.getElementById(id)?.closest(".docsec")?.id : id;
		const sec = sections.find((s) => s.id === (owner || sections[0].id)) ?? sections[0];
		for (const s of sections) s.classList.toggle("current", s === sec);
		for (const a of links) {
			if (a.getAttribute("href") === `#${sec.id}`) a.setAttribute("aria-current", "true");
			else a.removeAttribute("aria-current");
		}
		now.textContent = sec.querySelector("h2").textContent;
		fillOutline(sec);
		close();
	}
	toggle.addEventListener("click", () => {
		const open = toc.classList.toggle("open");
		toggle.setAttribute("aria-expanded", String(open));
	});
	// Where to land after the next change of section: a search result's place, else the section's top.
	const nav = { target: null };
	addEventListener("hashchange", () => {
		show();
		const id = location.hash.slice(1);
		if (nav.target) { landOn(nav.target); nav.target = null; return; }
		// A section: back up to the contents and the section's top. A heading inside one: that heading.
		(ids.has(id) || !id ? docs : document.getElementById(id) ?? docs).scrollIntoView();
	});
	show();
	// The browser scrolls to the named section itself as the page finishes loading; after that, back up to the contents.
	if (location.hash && ids.has(location.hash.slice(1))) addEventListener("load", () => docs.scrollIntoView());
	search(docs, sections, { show, nav, landOn });
}

/** Brings a search result's place into the middle of the screen and marks it for a moment. */
function landOn(el) {
	el.scrollIntoView({ block: "center" });
	el.classList.add("hit");
	setTimeout(() => el.classList.remove("hit"), 4000);
}
