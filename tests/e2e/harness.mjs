// The browser tests' stand-in for the site: serves the real browser scripts and styles (public/) and the real pages
// (pages.mjs), and plays the API, storage (the recording's parts) and the live picture's WHIP and WHEP addresses. The
// live picture is handed to a second browser (bridge.mjs), so the phone under test makes a real WebRTC connection, all
// inside the test container. Each test can change how a route answers (`answer`) and reads what the page sent (`calls`).
// Pages carry the site's own Content-Security-Policy, so a script the site's pages would block fails here too.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { clubFile } from "../../src/app/club-files.ts";
import { contentSecurityPolicy } from "../../src/app/respond.ts";
import { isSignInPage } from "../../src/features/signin/signin-paths.ts";
import { GAME_ID, TEAM_ID } from "./pages.mjs";

const TYPES = {
	".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
	".jpeg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};
export const VIDEO_ID = 41;
const ok = (data, status = 200) => ({ status, json: { ok: true, data } });
// The bridge (bridge.mjs) is the test's own page, not the site's. The sign-in pages' CSP allows Turnstile, as the site's does.
// As the site: the launch spinner (/?app) may show its own club's mark and its own look.
const cspFor = (path, address) => contentSecurityPolicy({ streamCustomerCode: "e2e", accountId: "e2e" },
	{ launch: path === "/" && address?.searchParams.has("app"), turnstile: isSignInPage(path) });

/**
 * Starts the server. `bridge` answers WHIP and WHEP offers. A route's answer is `{ status, json }`, `{ status, sdp,
 * location }`, `{ delayMs, then }` (answers late), or "drop" (the connection breaks, as on a lost signal).
 */
export async function startHarness({ publicDir, bridge, port = 8799 }) {
	const url = `http://127.0.0.1:${port}`;
	let state;
	const defaults = () => new Map([
		[`POST /api/live/${GAME_ID}/browser`, () => ok({ videoId: VIDEO_ID, partSize: 128 * 1024, whipUrl: `${url}/whip/${GAME_ID}` }, 201)],
		[`POST /api/live/${GAME_ID}/events`, ({ json }) => ok({ logged: json.events.length })],
		[`POST /api/live/${GAME_ID}/end`, () => ok({ status: "ended" })],
		[`POST /api/live/${GAME_ID}/save`, () => ok({ status: "saved" })],
		[`POST /api/live/${GAME_ID}/continue`, () => ({ status: 404, json: { ok: false, error: { message: "Recording not found" } } })],
		// A later segment's parts land under their own number (/r2/412/n for segment 2), so the PUT matcher still takes them.
		[`POST /api/uploads/${VIDEO_ID}/part-urls`, ({ json }) => ok({ urls: Object.fromEntries(json.partNumbers.map((n) => [n, `${url}/r2/${VIDEO_ID}${json.segment > 1 ? json.segment : ""}/${n}`])) })],
		[`POST /api/uploads/${VIDEO_ID}/complete`, ({ json }) => { state.completed = json.parts; return ok({ status: "processing" }); }],
		[`POST /api/uploads/${VIDEO_ID}/abort`, () => ok({ status: "cancelled" })],
		[`POST /whip/${GAME_ID}`, async ({ text }) => ({ status: 201, sdp: await bridge.answerWhip(text), location: `${url}/whip/${GAME_ID}/session/${++state.whipSessions}` })],
		[`POST /whep/${GAME_ID}`, async ({ text }) => ({ status: 201, sdp: await bridge.answerWhep(text), location: `${url}/whep/${GAME_ID}/session/1` })],
		["POST /api/photos", () => ok({ id: ++state.photos }, 201)],
	]);
	const reset = () => {
		state = { calls: [], parts: new Map(), completed: null, whipSessions: 0, photos: 0, routes: defaults(), pages: new Map() };
	};
	reset();

	async function reply(res, answer, path = "") {
		if (answer === "drop") return res.destroy();
		if (answer.delayMs) {
			await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
			return reply(res, answer.then, path);
		}
		const headers = { "Cache-Control": "no-store" };
		if (answer.location) headers.Location = answer.location;
		if (answer.etag) headers.ETag = answer.etag;
		if (answer.sdp !== undefined) return res.writeHead(answer.status, { ...headers, "Content-Type": "application/sdp" }).end(answer.sdp);
		// A page in answer to a form (the sign-in's steps), with the site's CSP like every page.
		if (answer.html !== undefined) return res.writeHead(answer.status, { ...headers, "Content-Type": "text/html", "Content-Security-Policy": cspFor(path) }).end(answer.html);
		res.writeHead(answer.status, { ...headers, "Content-Type": "application/json" }).end(answer.json === undefined ? "" : JSON.stringify(answer.json));
	}

	const server = createServer(async (req, res) => {
		const chunks = [];
		// A phone that drops the connection part way (a lost signal, a page gone) ends the body early; Node raises that
		// as an error on the request, which would take the whole suite down if nothing caught it.
		try {
			for await (const chunk of req) chunks.push(chunk);
		} catch {
			return res.destroy();
		}
		const body = Buffer.concat(chunks);
		const address = new URL(req.url, url);
		const path = address.pathname;
		const route = `${req.method} ${path}`;
		if (req.method === "GET" && state.pages.has(path)) {
			const page = state.pages.get(path)(address);
			// A file (a photo's download, say) or a redirect comes back as { status, headers, body }.
			if (typeof page !== "string") return res.writeHead(page.status ?? 200, page.headers).end(page.body);
			return res.writeHead(200, { "Content-Type": "text/html", ...(path === "/bridge" ? {} : { "Content-Security-Policy": cspFor(path, address) }) }).end(page);
		}
		// The club's colours and the manifest are made from the config, as the site makes them (app/club-files.ts).
		const made = req.method === "GET" ? clubFile(new Request(address, { method: "GET" }), address) : null;
		if (made) return made.text().then((text) => res.writeHead(200, { "Content-Type": made.headers.get("Content-Type") }).end(text));
		if (req.method === "GET") {
			const file = normalize(join(publicDir, path));
			if (!file.startsWith(publicDir)) return res.writeHead(403).end();
			return readFile(file).then(
				(data) => res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(data),
				() => res.writeHead(404).end(),
			);
		}
		const text = body.toString();
		let json = null;
		try { json = JSON.parse(text); } catch { /* not JSON: a part or an SDP offer */ }
		state.calls.push({ route, json, body, bytes: body.length, at: Date.now(), team: req.headers["x-courtside-team"] ?? null });
		// Like the site: a write that doesn't say which team its page was for is refused before anything happens.
		const team = req.headers["x-courtside-team"];
		if (req.method === "POST" && path.startsWith("/api/") && team !== TEAM_ID) {
			return reply(res, team
				? { status: 409, json: { ok: false, error: { code: "team_changed", message: "You switched team in another window. Reload this page to carry on." } } }
				: { status: 409, json: { ok: false, error: { code: "site_updated", message: "The site has been updated. Reload the page to carry on." } } });
		}
		const part = /^PUT \/r2\/\d+\/(\d+)$/.exec(route);
		if (part && !state.routes.has(route)) {
			state.parts.set(Number(part[1]), body);
			return reply(res, { status: 200, etag: `"etag-${part[1]}"` });
		}
		const handler = state.routes.get(route) ?? (route.startsWith("DELETE ") ? () => ({ status: 200 }) : () => ({ status: 404, json: { ok: false, error: { message: "no such test route" } } }));
		try {
			await reply(res, await handler({ text, json }));
		} catch (err) {
			reply(res, { status: 500, json: { ok: false, error: { message: `harness: ${err.message}` } } });
		}
	});
	await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
	return {
		url,
		reset,
		/** The page served at `path`, rendered fresh for each request (given its address, query string and all); or a file
		 * or redirect, as `{ status, headers, body }`. */
		page: (path, render) => state.pages.set(path, render),
		/** Changes how one route answers for this test, for example "POST /api/live/7/end". */
		answer: (route, handler) => state.routes.set(route, handler),
		calls: (prefix = "") => state.calls.filter((c) => c.route.startsWith(prefix)),
		get parts() { return state.parts; },
		get completed() { return state.completed; },
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}
