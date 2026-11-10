// Help: the search box narrows the questions as you type (every word must be in a question or its answer; a plural
// finds its singular too, search-words.js), and a heading inside a section shows only while one of its questions does.
// A link to a question (#watch, from this page or another) opens it.
import { hasEvery } from "./search-words.js";

const box = document.getElementById("help-search");
const questions = [...document.querySelectorAll("details.faq")];
const sections = [...document.querySelectorAll(".helpgroup")];
// A team manager's Help is in two parts: a part's name shows only while one of its questions does.
const parts = [...document.querySelectorAll(".helppart")];
const none = document.getElementById("help-none");
const hint = document.getElementById("help-hint");

/** Each heading inside a section (a team manager's own, or Live streaming under Filming) with the questions under it. */
const headings = [...document.querySelectorAll(".helpgroup .faqgroup:not(.gtitle), .helpgroup .faqsub")].map((heading) => {
	const under = [];
	for (let n = heading.nextElementSibling; n && !n.matches(".faqgroup, .faqsub"); n = n.nextElementSibling) if (n.matches("details.faq")) under.push(n);
	return { heading, under };
});

function openLinked() {
	const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
	if (target instanceof HTMLDetailsElement) target.open = true;
}
openLinked();
addEventListener("hashchange", openLinked);

function narrow() {
	const words = box.value.toLowerCase().split(/\s+/).filter(Boolean);
	let found = 0;
	for (const q of questions) {
		const hit = hasEvery(q.textContent, words);
		q.hidden = !hit;
		if (hit) found++;
	}
	for (const { heading, under } of headings) heading.hidden = words.length > 0 && !under.some((q) => !q.hidden);
	for (const s of sections) s.hidden = words.length > 0 && !s.querySelector("details.faq:not([hidden])");
	for (const p of parts) p.querySelector(".partname").hidden = words.length > 0 && !p.querySelector("details.faq:not([hidden])");
	if (none) none.hidden = !words.length || found > 0;
	if (hint) hint.hidden = words.length > 0;
}

if (box) {
	box.hidden = false;
	box.addEventListener("input", narrow);
}
