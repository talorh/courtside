import { CLUB } from "../../../club.ts";
// The Documentation page's further diagrams: the code's path to the live site, a team's life, a photo's path, an
// alert's path, and what to do when something goes wrong.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { draw, figure } from "./docs-draw.ts";

export function codeFlowDiagram(): SafeHtml {
	const d = draw("codeflow");
	return figure("codeflow", {
		w: 760, h: 260, min: 640, title: "The code's path to the live site",
		desc: "The production folder pushes main to the Artifacts repository with a ten-minute token; Workers Builds sees the push, runs the checks and deploys the Worker; a new computer clones the repository with a read token.",
		caption: "Only the release pushes, only to main, and only Workers Builds deploys. A read token is all a new computer needs to get the code.",
	}, html`${d.box({ x: 20, y: 40, w: 190, title: "courtside-prod folder", sub: "main, after the release's checks", kind: "step" })}
${d.box({ x: 285, y: 40, w: 200, title: "Artifacts: courtside/courtside", sub: "the repository, in the account", kind: "store" })}
${d.box({ x: 545, y: 40, w: 195, title: "Workers Builds", sub: "npm ci && npm run check", kind: "job" })}
${d.box({ x: 545, y: 170, w: 195, title: "Worker: courtside", sub: `live on ${CLUB.domain}`, kind: "worker" })}
${d.box({ x: 20, y: 170, w: 190, title: "A new computer", sub: "clone, then carry on", kind: "person" })}
${d.arrow([[210, 68], [283, 68]], { label: "push, ten-minute token", at: [180, 30] })}${d.arrow([[485, 68], [543, 68]], { label: "a push to main", at: [472, 30] })}
${d.arrow([[642, 96], [642, 168]], { label: "deploy:builds", at: [652, 136] })}
${d.arrow([[210, 198], [250, 198], [250, 110], [385, 110], [385, 96]], { dashed: true, label: "clone with a read token", at: [260, 126] })}`);
}

export function teamLifecycleDiagram(): SafeHtml {
	const d = draw("lifecycle");
	return figure("lifecycle", {
		w: 760, h: 210, min: 640, title: "A team's life on the site",
		desc: "A team is onboarded, runs its season (its setup checklist first), is closed at the season's end and becomes read-only, and is deleted with its footage on 31 December of the year its season ends or on a night an admin picks. A closed team can be reopened until deleting starts.",
		caption: "Deleting takes every video, clip, photo, original and record of the team, except what its download log names, which is kept its two years.",
	}, html`${d.box({ x: 10, y: 40, w: 170, title: "Onboarded", sub: "code, season, team manager", kind: "step" })}
${d.box({ x: 200, y: 40, w: 170, title: "Running", sub: "the checklist, then the season", kind: "done" })}
${d.box({ x: 390, y: 40, w: 170, title: "Closed", sub: "End season: read-only", kind: "service" })}
${d.box({ x: 580, y: 40, w: 170, title: "Deleted", sub: "31 Dec, or a night chosen", kind: "stop" })}
${d.arrow([[180, 68], [198, 68]])}${d.arrow([[370, 68], [388, 68]])}${d.arrow([[560, 68], [578, 68]])}
${d.arrow([[475, 96], [475, 140], [285, 140], [285, 98]], { label: "Reopen, until deleting starts", at: [300, 160] })}
${d.label(10, 196, "Each team is one season's squad: a new season is a new team, onboarded again.")}`);
}

export function photoDiagram(): SafeHtml {
	const d = draw("photo");
	const [phone, worker, images, members] = [90, 270, 450, 630];
	return figure("photo", {
		w: 720, h: 330, min: 600, title: "A photo's path",
		desc: "The phone makes the photo smaller and drops where it was taken, the Worker checks it's a JPEG and strips any metadata left, Images keeps it privately, and members see it through signed links that last six hours.",
		caption: "Nothing about where a photo was taken ever leaves the phone, and no picture is reachable without signing in.",
	}, html`${d.lane(phone, 140, "Phone", 300, "person")}${d.lane(worker, 140, "Worker", 300, "worker")}${d.lane(images, 140, "Images", 300, "store")}${d.lane(members, 140, "Members", 300, "person")}
${d.message(phone, worker, 100, "the photo, redrawn at most 2560 px, no location")}
${d.message(worker, images, 146, "a real JPEG, metadata stripped, stored privately")}
${d.message(worker, phone, 192, "saved, with the photo's own date")}
${d.message(members, worker, 238, "the Photos page")}
${d.message(worker, members, 284, "signed links, good for six hours")}`);
}

export function alertDiagram(): SafeHtml {
	const d = draw("alerts");
	return figure("alerts", {
		w: 760, h: 230, min: 640, title: "An alert's path",
		desc: "A check runs in a job, its level is saved each time and shown on Platform, a change for the worse raises a ticket on Support and emails the admins once, and when the check clears the ticket resolves itself.",
		caption: "Admins are emailed once, and again only if things get worse. Nothing nags: a check that clears closes its own ticket.",
	}, html`${d.box({ x: 10, y: 30, w: 230, title: "A check runs", sub: "every 5 minutes, or at 3am", kind: "job" })}
${d.box({ x: 265, y: 30, w: 230, title: "Its level is saved", sub: "ok, warning or urgent: Insights, Platform", kind: "step" })}
${d.box({ x: 520, y: 30, w: 230, title: "Worse than before?", sub: "a ticket on Support", kind: "service" })}
${d.box({ x: 520, y: 140, w: 230, title: "The admins emailed, once", sub: "again only if it gets worse", kind: "edge" })}
${d.box({ x: 265, y: 140, w: 230, title: "It clears", sub: "the ticket resolves itself", kind: "done" })}
${d.arrow([[240, 58], [263, 58]])}${d.arrow([[495, 58], [518, 58]])}${d.arrow([[635, 86], [635, 138]])}${d.arrow([[520, 168], [497, 168]])}
${d.arrow([[380, 196], [380, 212], [120, 212], [120, 88]], { label: "the next run checks again", at: [130, 208] })}`);
}

export function recoveryDiagram(): SafeHtml {
	const d = draw("recovery");
	const rows: Array<[string, string, string, string]> = [
		["A fix will take a while", "everyone but admins waits", "Maintenance page on", "npm run maintenance -- on"],
		["A bad deploy", "the site misbehaves since a release", "Roll the Worker back", "Deployments in the dashboard"],
		["A bad change to the data", "rows wrong since a moment", "D1 Time Travel", "back to any minute in 30 days"],
		["The database itself is gone", "or the wrong one", "Restore last night's backup", "npm run restore-d1, a new D1"],
		["Something deleted by mistake", "a video, within a day", "Clear its deleted fields", "its media is kept one day"],
	];
	const y = (i: number) => 16 + i * 66;
	return figure("recovery", {
		w: 700, h: y(rows.length) - 8, min: 600, title: "What to do when something goes wrong",
		desc: "Five problems and their answers: the maintenance page for a long fix, rolling the Worker back for a bad deploy, D1 Time Travel for a bad change to the data, restoring last night's backup when the database itself is gone, and clearing a video's deleted fields within a day of a mistaken delete.",
		caption: "Each answer is in the Cloudflare runbook step by step. Anything that deletes or restores data needs the owner's go-ahead first.",
	}, html`${rows.map(([problem, sub, answer, how], i) => html`${d.box({ x: 10, y: y(i), w: 300, h: 54, title: problem, sub, kind: "stop" })}
${d.arrow([[310, y(i) + 27], [368, y(i) + 27]])}${d.box({ x: 370, y: y(i), w: 320, h: 54, title: answer, sub: how, kind: "done" })}`)}`);
}
