// The Documentation page's first diagrams: the whole system, where the Worker runs, what happens to a request, and
// signing in.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { type Box, draw, figure } from "./docs-draw.ts";

export function systemDiagram(): SafeHtml {
	const d = draw("system");
	const row = (boxes: Array<Omit<Box, "y">>, y: number) => boxes.map((b) => d.box({ ...b, y }));
	// Data, media, AI and email: the Worker uses all but Email Routing, and the phone reaches R2, Stream and Images itself.
	const stores: Array<Omit<Box, "x" | "y" | "w">> = [
		{ title: "D1", sub: "data, Time Travel", kind: "store" }, { title: "R2", sub: "uploads, backups", kind: "store" },
		{ title: "Stream", sub: "video, clips, live", kind: "service" }, { title: "Images", sub: "photos", kind: "store" },
		{ title: "Workers AI", sub: "Ask, docs, fixtures", kind: "service" }, { title: "Email Sending", sub: "codes, alerts", kind: "service" },
		{ title: "Email Routing", sub: "security@ mail", kind: "service" },
	];
	const sx = (i: number) => 28 + i * 130, scx = (i: number) => sx(i) + 60;
	const ops: Array<Omit<Box, "x" | "y" | "w">> = [
		{ title: "Artifacts", sub: "the code", kind: "job" }, { title: "Workers Builds", sub: "checks, deploys", kind: "job" },
		{ title: "Staging Worker", sub: "the staging site", kind: "job" }, { title: "Workers Logs", sub: "errors, job runs", kind: "job" },
		{ title: "GraphQL Analytics", sub: "traffic, for Insights", kind: "job" }, { title: "Billing API", sub: "the bill, for Costs", kind: "job" },
	];
	const ox = (i: number) => 28 + i * 152;
	return figure("system", {
		w: 960, h: 624, min: 680, title: "How the site fits together",
		desc: "Everything is in the club's Cloudflare account. Phones and computers come in through the club's domain (DNS with DNSSEC, registered with Cloudflare Registrar), its edge protection (DDoS, the WAF, bot management, rate limiting, TLS) and its rules (cache, redirects, security headers), with Turnstile checking the sign-in. The Worker serves every page and runs the jobs Cron Triggers start; the Maintenance Worker takes over only while the site is down for work. The Worker uses D1, R2, Stream, Images, Workers AI and Email Sending, and hands a stopped-and-restarted live stream's parts to the joiner, a Durable Object in the courtside-join Worker, which runs a Container with ffmpeg to make one video. Phones send uploads and photos, and play video, straight to R2, Stream and Images on signed links; an AI tracking camera's app streams to Stream over RTMPS. Email Routing forwards security@ mail. Artifacts holds the code and Workers Builds deploys it, a second Worker, staging-courtside, runs staging, and the admin area reads Workers Logs, GraphQL Analytics and the Billing API.",
		caption: "Solid lines go through the Worker. Dashed lines skip it: the phone going straight to storage on short-lived signed links, so big files never pass through the Worker, and an AI camera streaming to Stream.",
	}, html`${d.box({ x: 362, y: 14, w: 200, title: "Phones and computers", sub: "families, coaches, admins", kind: "person" })}
${d.box({ x: 640, y: 14, w: 220, title: "AI tracking camera", sub: "its own app, over RTMPS", kind: "person" })}
${d.zone(4, 96, 952, 522, "Cloudflare account: Courtside")}
${d.zone(16, 126, 928, 104, "The club's domain")}
${row([{ x: 28, w: 236, title: "Turnstile", sub: "the sign-in's human check", kind: "edge" },
		{ x: 300, w: 324, title: "Edge protection", sub: "DDoS, WAF, bot management, rate limits, TLS", kind: "edge" },
		{ x: 636, w: 160, title: "Rules", sub: "cache, redirects, headers", kind: "edge" },
		{ x: 808, w: 124, title: "DNS", sub: "DNSSEC, Registrar", kind: "edge" }], 160)}
${d.zone(16, 246, 928, 104, "Workers")}
${row([{ x: 28, w: 150, title: "Maintenance", sub: "the Back soon page", kind: "worker" },
		{ x: 190, w: 150, title: "Cron Triggers", sub: "5 minutes, and 3am", kind: "job" },
		{ x: 352, w: 220, title: "Worker: courtside", sub: "pages, API, sign-in, jobs", kind: "worker" },
		{ x: 640, w: 170, title: "Durable Object", sub: "the joiner, courtside-join", kind: "worker" },
		{ x: 822, w: 110, title: "Container", sub: "ffmpeg", kind: "worker" }], 280)}
${d.zone(16, 366, 928, 116, "Data, media, AI and email")}
${stores.map((s, i) => d.box({ ...s, x: sx(i), y: 414, w: 120 }))}
${d.zone(16, 498, 928, 108, "Code, deploys, and what the admin area reads")}
${row(ops.map((o, i) => ({ ...o, x: ox(i), w: 140 })), 532)}
${d.arrow([[462, 70], [462, 158]])}${d.arrow([[462, 216], [462, 278]])}${d.arrow([[340, 308], [350, 308]])}
${d.arrow([[362, 42], [238, 42], [238, 158]], { dashed: true })}
${d.arrow([[572, 308], [638, 308]], { label: "parts", at: [588, 298] })}${d.arrow([[810, 308], [820, 308]])}
${stores.slice(0, 6).map((_, i) => d.arrow([[462, 336], [scx(i), 412]]))}
${d.arrow([[562, 42], [600, 42], [600, 86], [946, 86], [946, 396], [scx(1), 396], [scx(1), 412]], { dashed: true })}
${d.arrow([[860, 42], [946, 42], [946, 84]], { dashed: true })}
${d.arrow([[scx(2), 396], [scx(2), 412]], { dashed: true })}${d.arrow([[scx(3), 396], [scx(3), 412]], { dashed: true })}
${d.label(612, 82, "straight to storage and Stream")}
${d.arrow([[168, 560], [178, 560]])}`);
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
	desc: "A request passes the edge, then the Worker checks it came to the site's own address, checks the sign-in, works out who is asking and their team, checks a write names its team, and finally the route checks the role.",
	caption: "Each check happens in order; the first one that says no answers the request. A page's own route then checks the person's role.",
}, [
	{ step: { title: "A request arrives", sub: "a page, a form or a page script", kind: "person" } },
	{ step: { title: "Edge protection", sub: "DDoS, WAF, allowed methods, rate limits", kind: "edge" }, no: { title: "Blocked", sub: "at Cloudflare's edge", kind: "stop" } },
	{ step: { title: "Its own address?", sub: "the site's hostname, nothing else", kind: "worker" }, no: { title: "Not found", sub: "a bare 404", kind: "stop" } },
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
