// Help on a computer, laid out as the admin area's Documentation (desktop.css): the contents and a search down the
// left, one section at a time in the middle with cards to the sections either side, and On this page (the section's
// questions) down the right. A section is one of Help's own; a team manager's questions are a section for each of their
// headings, and Contact support is one too. A team manager's Help is in two parts (running the team, then what everyone
// does): each part's name heads its sections in the contents. On a phone none of it shows (only desktop.css's media query styles these
// classes and lists) and nothing here scrolls the page, so a phone's Help is as it always was.
const page = document.querySelector(".helppage");
const DESK = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
const onDesktop = () => matchMedia(DESK).matches && document.documentElement.dataset.view !== "mobile";

/** The part a section is in (a team manager's Help has two), or "" when Help has no parts. */
const partOf = (el) => el.closest("[data-part]")?.dataset.part ?? "";

/** Help's sections, each with its id, its heading's words, its part and the elements it's made of. */
function sectionsOf(main) {
	const out = [];
	for (const group of main.querySelectorAll(".helpgroup")) {
		const title = group.querySelector(":scope > .gtitle");
		if (title) { out.push({ id: group.id, title: title.textContent, part: partOf(group), els: [group] }); continue; }
		let current = null;
		for (const el of group.children) {
			if (el.matches("h2.faqgroup")) {
				el.id ||= `${group.id}-${out.length}`;
				current = { id: el.id, title: el.textContent, part: partOf(group), els: [] };
				out.push(current);
			}
			current?.els.push(el);
		}
	}
	const support = document.getElementById("ask-admin");
	if (support) {
		const els = [support];
		for (let n = support.nextElementSibling; n && !n.matches(".help-pn"); n = n.nextElementSibling) els.push(n);
		out.push({ id: support.id, title: support.textContent, part: partOf(support), els });
	}
	// In page order: a team manager's Contact support ends their part, before what everyone does.
	return out.sort((a, b) => (a.els[0].compareDocumentPosition(b.els[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

const link = (href, text, cls) => Object.assign(document.createElement("a"), { href, textContent: text, ...(cls ? { className: cls } : {}) });

function setup(page) {
	const main = page.querySelector(".helpmain"), list = document.getElementById("helptoc-list"), outline = document.getElementById("help-outline");
	const pn = page.querySelector(".help-pn"), box = document.getElementById("helptoc-q"), search = document.getElementById("help-search");
	const sections = sectionsOf(main);
	if (!sections.length) return;
	sections.forEach((s, i) => s.els.forEach((el) => { el.classList.add("hp"); el.dataset.page = String(i); }));
	page.classList.add("paged");
	list.replaceChildren(...sections.flatMap((s, i) => {
		const li = document.createElement("li"), a = link(`#${s.id}`, "");
		a.append(Object.assign(document.createElement("span"), { className: "num", textContent: `${i + 1}.` }), ` ${s.title}`);
		li.append(a);
		// A part's name before its first section.
		if (!s.part || s.part === sections[i - 1]?.part) return [li];
		return [Object.assign(document.createElement("li"), { className: "tocpart", textContent: s.part }), li];
	}));

	/** The section a place is in: the section itself, or the one holding a question. */
	const sectionOf = (id) => {
		const at = id ? document.getElementById(id) : null;
		const n = at?.closest("[data-page]")?.dataset.page ?? (at?.matches(".helpgroup") ? at.querySelector("[data-page]")?.dataset.page : null);
		return n === undefined || n === null ? 0 : Number(n);
	};

	function show(n) {
		const s = sections[n];
		for (const [i, other] of sections.entries()) other.els.forEach((el) => el.classList.toggle("hp-on", i === n));
		for (const a of list.querySelectorAll("a")) {
			if (a.getAttribute("href") === `#${s.id}`) a.setAttribute("aria-current", "true");
			else a.removeAttribute("aria-current");
		}
		const questions = s.els.flatMap((el) => (el.matches("details.faq") ? [el] : [...el.querySelectorAll("details.faq")]));
		outline.replaceChildren(...questions.map((q) => {
			const li = document.createElement("li");
			li.append(link(`#${q.id}`, q.querySelector("summary").textContent));
			return li;
		}));
		page.classList.toggle("no-outline", questions.length < 2);
		const prev = sections[n - 1], next = sections[n + 1];
		const card = (to, i, label, cls) => {
			const a = link(`#${to.id}`, "", cls);
			a.append(Object.assign(document.createElement("small"), { textContent: label }), Object.assign(document.createElement("b"), { textContent: `${i + 1}. ${to.title}` }));
			return a;
		};
		pn.replaceChildren(prev ? card(prev, n - 1, "Previous", "prev") : document.createElement("span"), ...(next ? [card(next, n + 1, "Next", "next")] : []));
	}

	// Searching shows every section's matching questions (help-search.js narrows them); the box down the left is the same
	// search as the page's own.
	box.addEventListener("input", () => {
		search.value = box.value;
		search.dispatchEvent(new Event("input"));
		page.classList.toggle("searching", box.value.trim() !== "");
	});

	function go(scroll) {
		const id = decodeURIComponent(location.hash.slice(1));
		show(sectionOf(id));
		if (!scroll || !onDesktop()) return;
		const at = id ? document.getElementById(id) : null;
		if (at instanceof HTMLDetailsElement) { at.open = true; at.scrollIntoView({ block: "start" }); }
		else page.scrollIntoView({ block: "start" });
	}
	addEventListener("hashchange", () => {
		if (box.value) { box.value = ""; box.dispatchEvent(new Event("input")); }
		go(true);
	});
	go(location.hash.length > 1);
}

if (page?.querySelector(".helpmain")) setup(page);
