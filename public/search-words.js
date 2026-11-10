// What a search box's words match, for Help's search and the Documentation's. A word matches any text that holds it,
// and a plural also matches its singular ("containers" finds "container", "families" finds "family"), so a search
// doesn't have to guess how the page worded it.
const ES_PLURAL = /(ss|x|ch|sh)es$/;

/** A lower-case word and, for a plural, its singular. Words that only happen to end in s ("status", "this") stay as they are. */
export function forms(word) {
	if (word.length <= 3 || /(ss|us|is)$/.test(word) || !word.endsWith("s")) return [word];
	if (word.endsWith("ies")) return [word, `${word.slice(0, -3)}y`];
	return [word, word.slice(0, ES_PLURAL.test(word) ? -2 : -1)];
}

/** True when the text holds every word (lower case), in any of its forms. */
export function hasEvery(text, words) {
	const lower = text.toLowerCase();
	return words.every((w) => forms(w).some((f) => lower.includes(f)));
}

/** Where the first of the words (in any form) is in the lower-case text; the start when none is there. */
export function firstAt(lower, words) {
	const found = words.flatMap(forms).map((f) => lower.indexOf(f)).filter((i) => i >= 0);
	return found.length ? Math.min(...found) : 0;
}

/** A pattern that finds every form of the words, the longest first, for marking them in a result. */
export function marker(words) {
	const all = [...new Set(words.flatMap(forms))].sort((a, b) => b.length - a.length);
	return new RegExp(all.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
}
