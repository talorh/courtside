// The photo pages a swipe moves between (photo-swipe.js): each one's facts, read in advance or on arrival, and putting a
// page's own parts (its caption, Newer and Older, All photos, and the side panel with its buttons) in place of the ones
// showing.
import { timeoutSignal } from "./net-timeout.js";

// A page that hasn't come in this long (a weak signal) is given up, so the swipe opens the photo as usual instead.
const READ_MS = 8000;
/** The parts of a photo's page that are its own, besides the picture. */
const OWN = [".photo-when", ".photonav", ".photoback", ".side"];

/** A page's facts: which photo it is, its pictures, and its neighbours' ids and pictures. */
export function facts(doc) {
	const f = doc.querySelector(".photoview");
	if (!f) return null;
	const side = (which) => (f.dataset[which] ? { id: f.dataset[which], src: f.dataset[`${which}Src`], thumb: f.dataset[`${which}Thumb`] ?? "" } : null);
	return { id: f.dataset.id, src: f.querySelector("img")?.getAttribute("src") ?? "", thumb: f.dataset.thumb ?? "", newer: side("newer"), older: side("older"), doc };
}

const pages = new Map(); // a photo's page's facts, by id
const reading = new Map(); // a read on its way, by id, so each page is asked for once at a time

/** The page as it was opened, kept as a copy apart from the page itself (which each swipe changes), so a swipe back
 * puts its own parts back. Taken before anything on the page is changed. */
export function opened(doc) {
	const f = facts(doc.cloneNode(true));
	if (f) pages.set(f.id, f);
	return f;
}

/** A page's facts when they're here already. */
export const known = (id) => pages.get(id) ?? null;
/** Forgets a page, so it's read again (its picture's link has run out). */
export const forget = (id) => { pages.delete(id); };

async function read(id) {
	const res = await fetch(`/photos/${id}`, { headers: { Accept: "text/html" }, signal: timeoutSignal(READ_MS) })
		.catch((err) => { console.warn(`photo swipe: photo ${id}'s page didn't come`, err); return null; });
	const text = res?.ok ? await res.text().catch((err) => { console.warn(`photo swipe: photo ${id}'s page stopped`, err); return null; }) : null;
	const f = text ? facts(new DOMParser().parseFromString(text, "text/html")) : null;
	if (f) pages.set(id, f);
	return f;
}

/** A page's facts, read when they aren't here yet: null when the page can't be read just now. */
export function pageFor(id) {
	if (pages.has(id)) return Promise.resolve(pages.get(id));
	if (!reading.has(id)) reading.set(id, read(id).finally(() => reading.delete(id)));
	return reading.get(id);
}

/** The page's own parts can't be used (and look it) while the next photo's page is on its way: until show() puts that
 * photo's in, they're still the last one's, and Save or Delete would act on a photo swiped away from. */
export function hold() {
	for (const sel of OWN) { const mine = document.querySelector(sel); if (mine) mine.inert = true; }
}

/** The page showing becomes `f`'s: its own parts, each a fresh copy (so `f` stays as it is, for a swipe back) that can be
 * used, and its title. */
export function show(f) {
	for (const sel of OWN) {
		const mine = document.querySelector(sel), theirs = f.doc.querySelector(sel);
		if (!mine) continue;
		if (!theirs) { mine.inert = false; continue; }
		const fresh = theirs.cloneNode(true);
		fresh.inert = false;
		mine.replaceWith(fresh);
	}
	document.title = f.doc.title;
}
