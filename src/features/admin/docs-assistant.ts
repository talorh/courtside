import { CLUB } from "../../club.ts";
// The Documentation AI assistant: an admin's question answered from the Documentation alone. The sections the question is
// about are picked by their words (a few at most, so the model reads them closely), sent with the question to Workers AI,
// and named beside the answer so the admin can read on. Nothing is stored but a count of questions a day.
import { z } from "zod";
import type { AppDeps } from "../../app/deps.ts";
import { HttpError } from "../../app/errors.ts";
import { addDays, localDate } from "../../shared/time.ts";
import { countDocsQuestion } from "./docs-ask-repository.ts";
import { type DocText, docSections } from "./docs-knowledge.ts";
import { logProblem } from "./problem-log.ts";

export const docsAskSchema = z.object({ question: z.string().trim().min(2, "Type a question first.").max(400, "Keep it under 400 characters.") });

/** Questions an admin a day: plenty to learn the site by, and a cap on Workers AI's use. */
export const DOCS_DAILY_QUESTIONS = 50;
const MAX_SECTIONS = 4, MAX_CHARS = 40_000;

const STOP = new Set(("a about after all also an and any are as at be been before but by can could do does doing done each for from get gets " +
	"had has have how i if in into is it its just me more most my no not of on once one only or our out over own same should so some such than " +
	"that the their them then there these they this those through to too under until up very was we were what when where which while who why " +
	"will with would you your site club").split(" "));

/** A word's stem, so "set", "setting" and "sets" match, as do "name" and "named": endings off, then a final e or a
 * doubled letter. Rough, but the same for the question and the sections, which is all it needs to be. */
function stem(w: string): string {
	let s = w;
	if (s.length > 4 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
	else if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
	else if (s.length > 4 && (s.endsWith("ed") || s.endsWith("es"))) s = s.slice(0, -2);
	else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
	if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
	if (s.length > 3 && s.at(-1) === s.at(-2) && !/[aeiou]/.test(s.at(-1)!)) s = s.slice(0, -1);
	return s;
}

/** The words for trouble, one word, so "broken" finds When something goes wrong (and "a bad deploy" in it). */
const TROUBLE = new Set(["wrong", "broken", "broke", "bad", "fail", "failed", "failing", "fails", "failure", "down", "outage"]);

/** A text's words, lower case and stemmed, small and common words left out. */
const words = (text: string) => (text.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*[a-z0-9]|[a-z0-9]/g) ?? [])
	.filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (TROUBLE.has(w) ? "wrong" : stem(w)));

/** The sections a question is about, best first: each of its words counts more the fewer sections have it, and more in a
 * section's title; a section must share a word with it. At most four, and about 10,000 tokens between them. */
const counts = new WeakMap<DocText[], Array<{ s: DocText; title: Set<string>; body: string[] }>>();

export function pickSections(question: string, all: DocText[] = docSections()): DocText[] {
	const asked = [...new Set(words(question))];
	// Each section's words, worked out once for the sections (the same for every question a Worker instance answers).
	let counted = counts.get(all);
	if (!counted) counts.set(all, counted = all.map((s) => ({ s, title: new Set(words(s.title)), body: words(s.text) })));
	const df = new Map(asked.map((w) => [w, counted.filter((c) => c.title.has(w) || c.body.includes(w)).length]));
	const scored = counted.map(({ s, title, body }) => {
		let score = 0;
		for (const w of asked) {
			const tf = body.filter((b) => b === w).length + (title.has(w) ? 5 : 0);
			if (tf) score += (1 + Math.log(tf)) * Math.log(1 + all.length / df.get(w)!);
		}
		// A long section mentions most things somewhere, so its words count for less.
		return { s, score: score / Math.pow(Math.max(body.length, 200), 0.35) };
	}).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
	const picked: DocText[] = [];
	let chars = 0;
	for (const { s, score } of scored) {
		// Well behind the best is noise: one shared everyday word.
		if (picked.length >= MAX_SECTIONS || score < scored[0]!.score * 0.25 || (picked.length && chars + s.text.length > MAX_CHARS)) break;
		picked.push(s);
		chars += s.text.length;
	}
	return picked;
}

const system = (sections: DocText[]) => `You are the Documentation AI assistant in the admin area of ${CLUB.siteName}, the private game-video
site for ${CLUB.name} basketball teams. You answer the site's admins about how the site works and how it's run.

Rules:
- Answer only from the documentation sections below. Never invent features, pages, commands, settings, prices or numbers.
- When the sections answer the question, even in part, answer it straight away: no preamble about what the
  documentation covers. Only when they don't answer it at all, say the documentation doesn't cover that, and name the
  closest section.
- Write commands, file names, table names and settings exactly as the documentation does.
- Plain text only: no markdown, no bold, no headings. Use a short numbered list for steps.
- Under 200 words. ${CLUB.english} English spelling. No dashes as punctuation: use commas, colons or full stops.
- Refer to a section by its number and title, as "9. The fixture and PlayHQ".

Documentation sections:
${sections.map((s) => `\n=== ${s.n}. ${s.title} ===\n${s.text}`).join("\n")}`;

export interface DocsAnswer { answer: string; sources: Array<{ id: string; n: number; title: string }> }

export async function askDocs(deps: AppDeps, email: string, question: string): Promise<DocsAnswer> {
	const now = deps.now();
	const asked = await countDocsQuestion(deps.db, email, localDate(now), localDate(addDays(now, -7)));
	if (asked > DOCS_DAILY_QUESTIONS) throw new HttpError(429, "too_many_questions", "That's a lot of questions for one day. Try the search, or ask again tomorrow.");
	const sections = pickSections(question);
	const sources = sections.map(({ id, n, title }) => ({ id, n, title }));
	if (!sections.length) return { answer: "The documentation doesn't cover that. Try other words, or the search above the contents.", sources };
	try {
		// The model sometimes adds bold or dashes anyway.
		const answer = (await deps.ai.explain(system(sections), question)).replace(/\*\*/g, "").replace(/\s*[—–]\s*/g, ", ");
		return { answer, sources };
	} catch (err) {
		console.error(JSON.stringify({ event: "docs_ask_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "ai_failed", teamId: null, who: email, what: "The Documentation AI assistant didn't answer a question", error: err });
		return { answer: "The Documentation AI assistant can't answer just now. Try again in a little while, or use the search.", sources };
	}
}
