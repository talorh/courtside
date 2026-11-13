// The Documentation page's admin area diagrams: where each page's figures come from, and how a team's month of costs is
// worked out.
import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { type Box, draw, figure } from "./docs-draw.ts";

type Step = Omit<Box, "x" | "y" | "w" | "h">;

export function adminDataDiagram(): SafeHtml {
	const d = draw("admindata");
	const sources: Step[] = [
		{ title: "The site's database", sub: "every team's rows, counted", kind: "store" },
		{ title: "The jobs' checks", sub: "each alert's level, saved", kind: "job" },
		{ title: "Cloudflare's analytics", sub: "a read-only token, GraphQL", kind: "service" },
		{ title: "Stream's API", sub: "minutes of storage left", kind: "service" },
		{ title: "Frankfurter", sub: "the day's US$ rate for the club's currency", kind: "edge" },
	];
	const pages: Step[] = [
		{ title: "Insights", sub: "counts, weeks, mobile and desktop", kind: "worker" },
		{ title: "Teams, Log", sub: "lists, right now, what happened", kind: "worker" },
		{ title: "Platform", sub: "each limit, Cloudflare's 30 days", kind: "worker" },
		{ title: "Costs", sub: "each team's months and budget", kind: "worker" },
		{ title: "Insights' Alerts", sub: "every check as a light", kind: "worker" },
	];
	const y = (i: number) => 20 + i * 80;
	return figure("admindata", {
		w: 760, h: 410, min: 640, title: "Where the admin area's figures come from",
		desc: "Five sources feed the admin pages, each read as a page opens: the site's database for every count, the jobs' saved alert levels, Cloudflare's analytics through a read-only token, Stream's API for minutes left, and Frankfurter for the exchange rate. Insights, Teams, the Log, Platform, Costs and Insights' Alerts each draw on them.",
		caption: "Besides the teams' own rows, the admin area keeps a few figures of its own: minutes watched by month, the day's exchange rate, each alert's level, the month's emails and each hour's server errors. Everything else is worked out each time a page opens.",
	}, html`${sources.map((s, i) => d.box({ ...s, x: 10, y: y(i), w: 240 }))}${pages.map((s, i) => d.box({ ...s, x: 510, y: y(i), w: 240 }))}
${d.box({ x: 295, y: 180, w: 170, title: "Read as it opens", sub: "Cloudflare: a few seconds", kind: "step" })}
${sources.map((_, i) => d.arrow([[250, y(i) + 28], [275, y(i) + 28], [275, 208], [293, 208]]))}
${pages.map((_, i) => d.arrow([[465, 208], [485, 208], [485, y(i) + 28], [508, y(i) + 28]]))}`);
}

export function costFlowDiagram(): SafeHtml {
	const d = draw("costflow");
	const inputs: Step[] = [
		{ title: "Its video storage", sub: "Stream minutes past the bundle", kind: "store" },
		{ title: "Its watching", sub: "US$1 for each 1,000 minutes", kind: "service" },
		{ title: "Its originals in R2", sub: "past the free 10 GB, its share", kind: "store" },
		{ title: "A share of fixed costs", sub: "by the days it ran that month", kind: "step" },
	];
	const y = (i: number) => 20 + i * 66;
	return figure("costflow", {
		w: 760, h: 290, min: 640, title: "A team's month of costs",
		desc: `A team's month adds up its own video storage past the bundle, its minutes watched, its originals in R2 past the free 10 GB, and a share of the site's fixed costs by the days it ran; that is turned from US dollars into ${CLUB.currency.name} at the day's rate and set against the team's season budget, which raises the Team budgets alert if it's over or heading over.`,
		caption: "Cloudflare's list prices are in the code (costs-prices.ts). The estimate for the rest of a season uses the team's own figures once it has three games with a video. Cloudflare's bill is the true figure.",
	}, html`${inputs.map((s, i) => d.box({ ...s, x: 10, y: y(i), w: 250, h: 52 }))}
${d.box({ x: 310, y: 112, w: 180, title: "The team's month", sub: "in US dollars", kind: "job" })}
${inputs.map((_, i) => d.arrow([[260, y(i) + 26], [285, y(i) + 26], [285, 140], [308, 140]]))}
${d.box({ x: 530, y: 20, w: 220, title: "In the club's currency at the day's rate", sub: "the ECB's, kept six hours", kind: "edge" })}
${d.box({ x: 530, y: 112, w: 220, title: "Against its budget", sub: "$200 a season unless set", kind: "done" })}
${d.box({ x: 530, y: 204, w: 220, title: "The Team budgets alert", sub: "urgent over, warns heading over", kind: "stop" })}
${d.arrow([[490, 140], [510, 140], [510, 48], [528, 48]])}${d.arrow([[640, 76], [640, 110]])}${d.arrow([[640, 168], [640, 202]])}`);
}
