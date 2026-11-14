import { CLUB } from "../../../club.ts";
// The Documentation page's running-the-site diagrams: the 5-minute job, the 3am job, the two environments, how a
// change is released, and the branches.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { type Box, draw, figure } from "./docs-draw.ts";

type Step = Omit<Box, "x" | "y" | "w" | "h">;
const COL = [30, 270, 510];

export function fiveMinuteDiagram(): SafeHtml {
	const d = draw("five");
	const team: Step[] = [
		{ title: "Live streams", sub: "save, close, mark live", kind: "service" }, { title: "Video copies", sub: "joins, copies, processing", kind: "service" },
		{ title: "HD downloads", sub: "the MP4 for each video", kind: "service" }, { title: "Clips", sub: "processing to ready", kind: "service" },
		{ title: "Retention", sub: "whatever's past its date", kind: "step" }, { title: "PlayHQ", sub: "fixtures and final scores", kind: "step" },
	];
	// The second row runs right to left, so the steps snake down in order.
	const at = (i: number) => ({ x: i < 3 ? COL[i]! : COL[5 - i]!, y: i < 3 ? 130 : 200 });
	const site: Step[] = [
		{ title: "Closed teams", sub: "a slice deleted, when due", kind: "step" }, { title: "Emails", sub: "any that didn't go", kind: "service" },
		{ title: "Health checks", sub: "the site, and games 8 hours out", kind: "step" },
	];
	return figure("five", {
		w: 760, h: 400, min: 640, title: "The 5-minute job",
		desc: "Every five minutes the job chooses this run's teams, then for each team handles live streams, video copies (a carried-on stream's parts joined into one first), HD downloads, clips, retention and PlayHQ, and then once a run deletes a slice of any closed team due to go, sends emails that didn't go and runs the health checks, the coming games' among them.",
		caption: "Busy teams (a game today, something streaming or processing) get a turn every run; quiet teams take turns, 12 a run, so every team is reached within the hour. One team's or one step's failure never stops the rest.",
	}, html`${d.box({ x: 200, y: 16, w: 360, title: "Choose this run's teams", sub: "busy teams every run, quiet ones 12 at a time", kind: "job" })}
${d.zone(10, 100, 740, 170, "Each team")}${d.zone(10, 292, 740, 98, "Once a run")}
${team.map((s, i) => d.box({ ...s, ...at(i), w: 220, h: 52 }))}
${d.arrow([[380, 72], [380, 90], [140, 90], [140, 128]])}${d.arrow([[250, 156], [268, 156]])}${d.arrow([[490, 156], [508, 156]])}
${d.arrow([[620, 182], [620, 198]])}${d.arrow([[510, 226], [492, 226]])}${d.arrow([[270, 226], [252, 226]])}${d.arrow([[140, 252], [140, 322]])}
${site.map((s, i) => d.box({ ...s, x: COL[i]!, y: 324, w: 220, h: 52 }))}${d.arrow([[250, 350], [268, 350]])}${d.arrow([[490, 350], [508, 350]])}`);
}

export function nightlyDiagram(): SafeHtml {
	const d = draw("nightly");
	const night: Step[] = [
		{ title: "Backup", sub: "the database, to R2", kind: "store" }, { title: "Sweep", sub: "leftover media", kind: "job" },
		{ title: "Sign-in clean-up", sub: "old sessions, codes", kind: "step" }, { title: "Nightly checks", sub: "sizes, costs, the joiner", kind: "step" },
	];
	return figure("nightly", {
		w: 760, h: 130, min: 640, title: "The 3am job",
		desc: "Every night at 3am local time: a checked backup of the database to R2, a sweep of leftover media in Stream and Images, a clean-up of finished sign-in sessions and codes, and the nightly checks, a test of the video joiner among them.",
		caption: "Each step stands on its own: a failure is reported on Platform and raises a ticket, and the next night runs again.",
	}, html`${d.label(10, 22, "Every night at 3am, local time")}
${night.map((s, i) => html`${d.box({ ...s, x: 10 + i * 192, y: 44, w: 168, h: 64 })}${i < 3 ? d.arrow([[178 + i * 192, 76], [200 + i * 192, 76]]) : ""}`)}`);
}

export function releaseDiagram(): SafeHtml {
	const d = draw("release");
	const flow: Step[] = [
		{ title: "A branch", sub: "feature/ or fix/, tests first", kind: "step" }, { title: "Merged into staging", sub: "npm run check passes", kind: "step" },
		{ title: "The staging site", sub: "tried on a phone, signed in", kind: "service" }, { title: "npm run release", sub: "every check, browser tests", kind: "job" },
		{ title: "Artifacts: main", sub: "the site's own git repo", kind: "store" }, { title: "Workers Builds", sub: "checks again, then deploys", kind: "worker" },
	];
	const at = (i: number) => ({ x: i < 3 ? COL[i]! : COL[5 - i]!, y: i < 3 ? 20 : 130 });
	return figure("release", {
		w: 760, h: 330, min: 640, title: "How a change goes live",
		desc: `A change is built on its own branch, merged into staging and tried on the staging site, then npm run release checks everything and pushes main to the site's Artifacts repository, where Workers Builds checks it again and deploys it to ${CLUB.domain}.`,
		caption: "Staging and production run the same commit. Anything changed after it's been tried on staging goes back to staging first.",
	}, html`${flow.map((s, i) => d.box({ ...s, ...at(i), w: 220, h: 58 }))}
${d.arrow([[250, 49], [268, 49]])}${d.arrow([[490, 49], [508, 49]])}${d.arrow([[620, 78], [620, 128]])}
${d.arrow([[510, 159], [492, 159]])}${d.arrow([[270, 159], [252, 159]])}${d.arrow([[140, 188], [140, 238]])}
${d.box({ x: 30, y: 240, w: 220, h: 58, title: `${CLUB.domain}`, sub: "live for every team", kind: "done" })}
${d.label(290, 274, "Nothing is deployed any other way: a push to main is a deploy.")}`);
}

export function environmentsDiagram(): SafeHtml {
	const d = draw("environments");
	return figure("environments", {
		w: 760, h: 320, min: 640, title: "The two environments and how each is deployed",
		desc: "From the staging folder, npm run staging deploys the staging branch as a preview of the Worker with its own database and bucket. From the main folder, npm run release pushes main to Cloudflare, where Workers Builds deploys the live Worker. Stream, Images, Workers AI and Email Sending are shared, with staging's things labelled.",
		caption: "Staging is deployed from the computer in about a minute, as often as needed. Production is deployed only by Workers Builds, from a push the release makes once every check has passed.",
	}, html`${d.zone(4, 14, 196, 230, "This computer")}
${d.box({ x: 16, y: 48, w: 172, title: "courtside-staging", sub: "staging and the branches", kind: "step" })}
${d.box({ x: 16, y: 170, w: 172, title: "courtside-prod", sub: "main", kind: "step" })}
${d.box({ x: 230, y: 48, w: 170, title: "npm run staging", sub: "check, migrations, deploy", kind: "job" })}
${d.box({ x: 430, y: 48, w: 320, title: "Staging: a preview of courtside", sub: "D1 and R2 courtside-staging, test data only", kind: "worker" })}
${d.box({ x: 230, y: 170, w: 170, title: "npm run release", sub: "every check, then push", kind: "job" })}
${d.box({ x: 430, y: 170, w: 150, title: "Workers Builds", sub: "checks, deploys", kind: "job" })}
${d.box({ x: 600, y: 170, w: 150, title: `${CLUB.domain}`, sub: "D1 courtside, R2 originals", kind: "done" })}
${d.arrow([[188, 76], [228, 76]])}${d.arrow([[400, 76], [428, 76]])}
${d.arrow([[188, 198], [228, 198]])}${d.arrow([[400, 198], [428, 198]])}${d.arrow([[580, 198], [598, 198]])}
${d.box({ x: 230, y: 266, w: 520, h: 44, title: "Stream, Images, Workers AI, Email Sending: shared", sub: "staging's things labelled and swept within a week", kind: "service" })}
${d.arrow([[590, 104], [590, 264]], { dashed: true })}${d.arrow([[675, 226], [675, 264]], { dashed: true })}`);
}

export function branchesDiagram(): SafeHtml {
	const d = draw("branches");
	return figure("branches", {
		w: 760, h: 190, min: 640, title: "The branches",
		desc: "Feature and fix branches come off staging and are merged back into it; main is only ever fast-forwarded to staging for a release.",
		caption: "Every branch comes off staging and is merged back once its tests pass, then deleted. Nothing is committed on main directly.",
	}, html`${d.box({ x: 20, y: 20, w: 200, title: "feature/<name>", sub: "a new thing, tests first", kind: "step" })}
${d.box({ x: 20, y: 110, w: 200, title: "fix/<name>", sub: "a repair, test first", kind: "step" })}
${d.box({ x: 290, y: 65, w: 190, title: "staging", sub: "npm run staging deploys it", kind: "service" })}
${d.box({ x: 550, y: 65, w: 190, title: "main", sub: "npm run release deploys it", kind: "done" })}
${d.arrow([[220, 48], [288, 85]], { label: "merged in", at: [226, 40] })}${d.arrow([[220, 138], [288, 101]])}
${d.arrow([[480, 93], [548, 93]], { label: "fast-forward", at: [482, 82] })}`);
}
