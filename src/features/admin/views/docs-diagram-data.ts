// The Documentation page's map of the database: every table, grouped by what it's for, the team's own above the
// site-wide ones.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { draw, figure } from "./docs-draw.ts";

const TEAM_GROUPS: Array<{ title: string; tables: string[] }> = [
	{ title: "People", tables: ["members", "players", "favourites", "ask_counts"] },
	{ title: "Games", tables: ["games", "game_scores", "game_lines", "playhq_fixtures", "coach_notes"] },
	{ title: "Video", tables: ["videos", "recording_segments", "clips", "clip_players", "live_streams", "downloads", "media_downloads", "video_views"] },
	{ title: "Photos and roster", tables: ["photos", "roster_families", "roster_slots", "roster_duties", "roster_weeks"] },
	{ title: "Requests", tables: ["removal_requests", "clip_removal_requests", "photo_removal_requests", "activity"] },
];

const SITE_WIDE = ["admins", "sessions", "sign_in_codes", "sign_in_events", "sign_in_holds", "view_weeks", "support_requests", "support_messages",
	"platform_alerts", "server_errors", "problems", "email_months", "admin_log", "docs_ask_counts", "cost_views", "exchange_rates", "billed_usage"];

/** A card: its heading, then a table name a line. */
const card = (x: number, y: number, w: number, title: string, lines: string[], kind: string) => html`<g class="dg-box k-${kind}"><rect x="${x}" y="${y}" width="${w}" height="${34 + lines.length * 17}" rx="10"/>
<text class="dg-t" x="${x + w / 2}" y="${y + 22}">${title}</text>${lines.map((t, i) => html`<text class="dg-m" x="${x + 9}" y="${y + 46 + i * 17}">${t}</text>`)}</g>`;

export function dataDiagram(): SafeHtml {
	const d = draw("data");
	const x = (i: number) => 8 + i * 150;
	const site = [0, 5, 10, 15].map((at) => SITE_WIDE.slice(at, at + 5));
	return figure("data", {
		w: 760, h: 440, min: 640, title: "The database's tables",
		desc: "One teams table, with every team's own tables grouped as people, games, video, photos and roster, and requests, each row carrying its team. Below them the site-wide tables: admins, the sign-in's sessions, codes, events and holds, the devices a week by view, support tickets and messages, platform alerts, server errors, problems (anything that failed, for the admin Log), the month's emails, the admin log, the Documentation assistant's questions, and Costs' minutes watched, exchange rate and Cloudflare's bill.",
		caption: "Every team table carries a team_id, and every query names it, so one team can never read another's rows. The site-wide tables belong to no team.",
	}, html`${d.box({ x: 290, y: 16, w: 180, h: 52, title: "teams", sub: "one row a team", kind: "store" })}
${TEAM_GROUPS.map((g, i) => html`${card(x(i), 110, 148, g.title, g.tables, "step")}${d.arrow([[380, 68], [x(i) + 74, 108]])}`)}
<g class="dg-box k-service"><rect x="8" y="276" width="744" height="150" rx="10"/><text class="dg-t" x="380" y="298">Site-wide, belonging to no team</text>
${site.map((col, c) => col.map((t, i) => html`<text class="dg-m" x="${40 + c * 185}" y="${324 + i * 20}">${t}</text>`))}</g>`);
}
