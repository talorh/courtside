import { z } from "zod";
import { CLUB } from "../../club.ts";
import type { AppDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { formatClock, isRealDate, localDate } from "../../shared/time.ts";
import type { Competition } from "./games-repository.ts";
import type { ImportedGame } from "./fixture-import.ts";
import { phaseOfWords } from "./season-phase.ts";

// Any public fixture page (a club site, a tournament page, a competition's draw), read by Workers AI. The page is
// fetched by the Worker, cut down to its text, and the model lists the team's games; they're checked before adding.
// A page that only draws its fixture with JavaScript after it loads has no games in its text, and the page says so.

const MAX_PAGE_BYTES = 2_000_000;
const MAX_TEXT = 30_000; // about 8,000 tokens

const SCHEMA = {
	type: "object",
	properties: {
		games: {
			type: "array",
			items: {
				type: "object",
				properties: { date: { type: "string" }, time: { type: "string" }, round: { type: "string" }, phase: { type: "string" }, opponent: { type: "string" }, venue: { type: "string" } },
				required: ["date", "time", "round", "phase", "opponent", "venue"],
			},
		},
	},
	required: ["games"],
};
const readSchema = z.object({
	games: z.array(z.object({ date: z.string(), time: z.string(), round: z.string(), phase: z.string(), opponent: z.string(), venue: z.string() }).partial()).max(200),
});

const system = (today: string) => `You read sports fixture web pages and list the games one junior basketball team plays.
Today is ${today} (local time, ${CLUB.timeZone}). Reply with JSON only. For each game the team plays:
- date: YYYY-MM-DD. If the page leaves out the year, use the year that puts the game closest after today.
- time: tip-off, 24-hour HH:MM local time, or "" if the page doesn't give one.
- round: as the page names it ("Round 3", "Semi Final", "Pool A Game 2"), or "".
- phase: for a ${CLUB.league} game, the part of the season the page puts it in: "Grading phase 1", "Crossover", "Grading phase 2" or "Championship season", or "" if the page doesn't say.
- opponent: the other team's name, or "" if not decided yet.
- venue: venue and court, or "".
Only games for our team. Leave out byes, results, ladders and other teams' games. Never make up a game, date or time.
If the page has no games for the team, reply {"games": []}.`;

/** The text of a web page, table cells kept apart, so the model can read rows. */
export function pageText(page: string): string {
	return page
		.replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, " ")
		.replace(/<\/(td|th)>/gi, " | ").replace(/<(br|\/tr|\/p|\/div|\/li|\/h\d|\/section|\/article)\b[^>]*>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, n: string) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : "")).replace(/&#39;|&rsquo;|&lsquo;/g, "'")
		.replace(/[ \t]+/g, " ").replace(/ *\n[\s|]*/g, "\n").trim().slice(0, MAX_TEXT);
}

/** Follows up to five redirects, every one over HTTPS (never on to an http:// address). */
async function fetchHttps(start: URL): Promise<Response> {
	let url = start;
	for (let hop = 0; hop <= 5; hop++) {
		const res = await fetch(url, {
			redirect: "manual", signal: AbortSignal.timeout(15_000),
			headers: { "User-Agent": "Mozilla/5.0 (compatible; CourtsideFixtureReader/1.0)", Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
		});
		const next = res.status >= 300 && res.status < 400 ? res.headers.get("Location") : null;
		if (!next) return res;
		url = new URL(next, url);
		if (url.protocol !== "https:") throw new Error(`Redirected to a page that isn't https: ${url.origin}`);
	}
	throw new Error("Too many redirects");
}

async function fetchPage(link: string): Promise<string> {
	const url = URL.canParse(link) ? new URL(link) : null;
	if (!url || !["https:", "http:"].includes(url.protocol)) throw badRequest("That isn't a web link. Copy the address of the fixture page and paste it here.");
	url.protocol = "https:"; // an http:// link is asked for securely
	const res = await fetchHttps(url).catch((err: unknown) => {
		throw badRequest("Couldn't open that page. Check the link works in a private window (it must be public).", err);
	});
	if (!res.ok) throw badRequest(`That page didn't open (it said ${res.status}). It needs to be public: check the link works in a private window.`);
	if (!/html|text/i.test(res.headers.get("Content-Type") ?? "")) throw badRequest("That link isn't a web page. For a spreadsheet, use Add from a spreadsheet instead.");
	return readUpTo(res, MAX_PAGE_BYTES);
}

/** The start of the body, without holding a huge page in memory: stops reading once it has `max` bytes. */
async function readUpTo(res: Response, max: number): Promise<string> {
	if (!res.body) return "";
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (size < max) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		size += value.byteLength;
	}
	await reader.cancel();
	const bytes = new Uint8Array(size);
	chunks.reduce((at, c) => (bytes.set(c, at), at + c.byteLength), 0);
	return new TextDecoder().decode(bytes.subarray(0, max));
}

/** The team's games on a public fixture page, and any problems to show. `team`: how the page may name it (fixtureTeamHint);
 * `usualTime`: its usual tip-off (usualTipOff), for a game the page gives no time for, shown as a problem to fix. */
export async function readFixtureLink(deps: AppDeps, link: string, o: { team: string; usualTime: string; competition: Competition; noVideo: boolean }):
	Promise<{ games: ImportedGame[]; problems: string[] }> {
	const text = pageText(await fetchPage(link));
	const empty = "No games found on that page. Some sites only show their fixture after the page loads, which can't be read here: download the fixture as a spreadsheet instead, or add the games by hand.";
	if (text.length < 80) return { games: [], problems: [empty] };
	const raw = await deps.ai.readJson(system(localDate(deps.now())), `Our team: ${o.team}\nPage: ${link}\n\n${text}`, SCHEMA)
		.catch((err: unknown) => { throw badRequest("The AI couldn't read that page just now. Try again in a minute.", err); });
	const read = readSchema.safeParse(raw);
	if (!read.success) throw badRequest("The AI's answer didn't make sense. Try again, or use a spreadsheet instead.");
	const games: ImportedGame[] = [], problems: string[] = [];
	for (const g of read.data.games) {
		const date = (g.date ?? "").trim(), time = (g.time ?? "").trim();
		if (!isRealDate(date)) { problems.push(`Left out a game with no clear date${g.opponent ? ` (vs ${g.opponent})` : ""}.`); continue; }
		const okTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
		if (!okTime) problems.push(`No tip-off time for ${date}${g.opponent ? ` vs ${g.opponent}` : ""}: set to ${formatClock(o.usualTime)}, edit it after adding.`);
		games.push({
			startsAt: `${date}T${okTime ? time : o.usualTime}`, competition: o.competition, roundLabel: (g.round ?? "").trim().slice(0, 40),
			opponent: ((g.opponent ?? "").trim() || "TBC").slice(0, 80), venue: (g.venue ?? "").trim().slice(0, 120), noVideo: o.noVideo, liveStream: true,
			phase: o.competition === CLUB.league ? phaseOfWords(g.phase ?? "") : null,
		});
	}
	if (!games.length && !problems.length) problems.push(empty);
	return { games, problems };
}
