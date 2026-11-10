// The Documentation page's first diagrams: the whole system, where the Worker runs, what happens to a request, and
// signing in.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { type Box, draw, figure } from "./docs-draw.ts";

export function systemDiagram(): SafeHtml {
	const d = draw("system");
	const services: Array<Omit<Box, "x" | "y" | "w">> = [
		{ title: "D1: courtside", sub: "every team's data", kind: "store" }, { title: "Workers AI", sub: "Ask, docs, fixtures", kind: "service" },
		{ title: "Email Sending", sub: "codes, welcomes", kind: "service" }, { title: "R2", sub: "originals, backups", kind: "store" },
		{ title: "Stream", sub: "video, clips, live", kind: "service" }, { title: "Images", sub: "photos", kind: "store" },
	];
	const x = (i: number) => 8 + i * 126, cx = (i: number) => x(i) + 58;
	return figure("system", {
		w: 760, h: 440, min: 640, title: "How the site fits together",
		desc: "Phones and computers reach the Worker through Cloudflare's edge protection. The Worker, and its scheduled jobs, use D1, Workers AI, Email Sending, R2, Stream and Images, and hand a stopped-and-restarted live stream's parts to the joiner, a second small Worker with a container, to make one video. Uploads, playback and photos go from the phone straight to R2, Stream and Images on signed links.",
		caption: "Solid lines go through the Worker. Dashed lines are the phone going straight to storage on short-lived signed links, so big files never pass through the Worker.",
	}, html`${d.zone(4, 96, 752, 336, "Cloudflare account: Courtside")}
${d.box({ x: 280, y: 16, w: 200, title: "Phones and computers", sub: "families, coaches, admins", kind: "person" })}
${d.box({ x: 250, y: 126, w: 260, title: "Edge protection", sub: "DDoS, WAF, human check, rate limits", kind: "edge" })}
${d.box({ x: 260, y: 222, w: 240, title: "Worker: courtside", sub: "pages, API, sign-in", kind: "worker" })}
${d.box({ x: 30, y: 222, w: 180, title: "Scheduled jobs", sub: "every 5 minutes, and 3am", kind: "job" })}
${d.box({ x: 540, y: 126, w: 190, title: "Joiner: courtside-join", sub: "a container with ffmpeg", kind: "worker" })}
${d.arrow([[380, 72], [380, 124]])}${d.arrow([[380, 182], [380, 220]])}${d.arrow([[210, 250], [258, 250]])}
${d.arrow([[500, 240], [635, 240], [635, 184]], { label: "a game's parts to join", at: [510, 258] })}
${services.map((s, i) => html`${d.box({ ...s, x: x(i), y: 356, w: 116 })}${d.arrow([[380, 278], [cx(i), 354]])}`)}
${d.arrow([[480, 44], [744, 44], [744, 330], [cx(3), 330], [cx(3), 354]], { dashed: true })}
${d.arrow([[cx(4), 330], [cx(4), 354]], { dashed: true })}${d.arrow([[cx(5), 330], [cx(5), 354]], { dashed: true })}
${d.label(560, 36, "direct, on signed links")}`);
}

export function placementDiagram(): SafeHtml {
	const d = draw("placement");
	return figure("placement", {
		w: 760, h: 250, min: 640, title: "Where the Worker runs",
		desc: "A phone reaches the Cloudflare data centre nearest it, which runs the zone's protections, then the request goes to the Worker in its region, placed beside the database, so each of a page's queries takes a millisecond or two.",
		caption: "Without placement the Worker runs wherever the request lands, so a phone sent through Singapore or the US by its network would send every query across the ocean.",
	}, html`${d.zone(500, 14, 254, 222, "The region")}
${d.box({ x: 20, y: 40, w: 200, title: "A phone in the club's time zone", sub: "a family on the site", kind: "person" })}
${d.box({ x: 260, y: 40, w: 200, title: "Nearest data centre", sub: "DDoS, WAF, human check", kind: "edge" })}
${d.box({ x: 520, y: 40, w: 214, title: "Worker: courtside", sub: "placement aws:ap-southeast-2", kind: "worker" })}
${d.box({ x: 520, y: 160, w: 214, title: "D1: courtside", sub: "primary, the region", kind: "store" })}
${d.arrow([[220, 68], [258, 68]])}${d.arrow([[460, 68], [518, 68]], { label: "one hop", at: [466, 58] })}
${d.arrow([[627, 96], [627, 158]], { both: true, label: "each query, 1 to 2 ms", at: [640, 132] })}`);
}

/** A column of steps down the left, each with what happens when it says no to its right. */
function steps(id: string, o: { title: string; desc: string; caption: string }, rows: Array<{ step: Omit<Box, "x" | "y" | "w">; no?: Omit<Box, "x" | "y" | "w"> }>): SafeHtml {
	const d = draw(id);
	const y = (i: number) => 16 + i * 86;
	return figure(id, { w: 660, h: y(rows.length) - 14, min: 560, ...o }, html`${rows.map((r, i) => html`${d.box({ ...r.step, x: 30, y: y(i), w: 330, h: 58 })}
${i < rows.length - 1 ? d.arrow([[195, y(i) + 58], [195, y(i + 1) - 2]]) : ""}
${r.no ? html`${d.box({ ...r.no, x: 420, y: y(i), w: 220, h: 58 })}${d.arrow([[360, y(i) + 29], [418, y(i) + 29]])}` : ""}`)}`);
}

export const requestDiagram = (): SafeHtml => steps("request", {
	title: "What happens to a request",
	desc: "A request passes the edge, then the Worker checks the sign-in, works out who is asking and their team, checks a write names its team, and finally the route checks the role.",
	caption: "Each check happens in order; the first one that says no answers the request. A page's own route then checks the person's role.",
}, [
	{ step: { title: "A request arrives", sub: "a page, a form or a page script", kind: "person" } },
	{ step: { title: "Edge protection", sub: "DDoS, WAF, allowed methods, rate limits", kind: "edge" }, no: { title: "Blocked", sub: "at Cloudflare's edge", kind: "stop" } },
	{ step: { title: "Signed in?", sub: "the session cookie, looked up in D1", kind: "worker" }, no: { title: "To the sign-in page", sub: "and back after the code", kind: "stop" } },
	{ step: { title: "Who, and which team", sub: "the teams' lists and the team cookie", kind: "step" }, no: { title: "Admin pages", sub: "site admins only", kind: "step" } },
	{ step: { title: "Team guard", sub: "a write names its team; closed is read-only", kind: "step" }, no: { title: "Refused", sub: "reload, or read only", kind: "stop" } },
	{ step: { title: "The route", sub: "role check, then the page or API", kind: "done" } },
]);

export const signInDiagram = (): SafeHtml => steps("signin", {
	title: "Signing in",
	desc: "Someone types their email. Turnstile checks a person is asking. A code is only sent to an address on a team's list or an admin's, within the limits. The code lasts 10 minutes, and a right code gives a 30-day session on that device.",
	caption: "Nobody gets a code unless their email is on a team's list (or they're a site admin). Sessions are per device, so a phone and a computer each sign in once.",
}, [
	{ step: { title: "The sign-in page", sub: "the email is typed", kind: "person" } },
	{ step: { title: "A person, not a script?", sub: "Turnstile, checked with Cloudflare", kind: "edge" }, no: { title: "No code sent", sub: "told to try again", kind: "stop" } },
	{ step: { title: "On a team's list, or an admin?", sub: "checked in D1", kind: "step" }, no: { title: "No code sent", sub: "told to ask their team manager", kind: "stop" } },
	{ step: { title: "Within the limits?", sub: "per address, per IP, site-wide", kind: "step" }, no: { title: "No code sent", sub: "told to wait", kind: "stop" } },
	{ step: { title: "A code is emailed", sub: "six digits, good for 10 minutes", kind: "service" } },
	{ step: { title: "The code is typed", sub: "checked against its hash", kind: "step" }, no: { title: "Five wrong tries", sub: "and the code is void", kind: "stop" } },
	{ step: { title: "Signed in for 30 days", sub: "on this device", kind: "done" } },
]);
