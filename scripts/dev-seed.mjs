// npm run dev:seed   Example data for the local dev server: the Saints' first team, the development address
// (deploy.config.ts devEmail) as its team manager and a site admin, a squad named after NBA players, a season of games
// with a few scores, and roster families. Nothing here is a real person. cf has no local query command, so this writes
// straight into the local database file cf dev keeps (.cloudflare/state, after npm run dev:db). Run again to start over.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_STATE } from "./dev-db.mjs";

const email = /\bdevEmail:\s*"([^"]*)"/.exec(readFileSync("deploy.config.ts", "utf8"))?.[1] ?? "you@example.com";
const team = "b12.1-2026";
const now = "2026-10-01T00:00:00.000Z";
const games = [
	["2026-10-09T18:40", "VJBL", "1", "Lakeside Rockets", "Lakeside Stadium, Court 2", 41, 36],
	["2026-10-16T18:40", "VJBL", "2", "Riverton Wolves", "Saints Stadium, Court 1", 38, 44],
	["2026-10-23T18:40", "VJBL", "3", "Westside Storm", "Westside Centre, Court 4", 52, 51],
	["2026-10-30T18:40", "VJBL", "4", "Hillcrest Rovers", "Saints Stadium, Court 1", 47, 30],
	["2026-11-06T18:40", "VJBL", "5", "Bayside Comets", "Saints Stadium, Court 2", null, null],
	["2026-11-13T18:40", "VJBL", "6", "Pine Valley Eagles", "Pine Valley Stadium, Court 1", null, null],
	["2026-11-20T18:40", "VJBL", "7", "Seaview Breakers", "Saints Stadium, Court 1", null, null],
];
const sql = [
	"DELETE FROM game_scores; DELETE FROM roster_slots; DELETE FROM roster_families; DELETE FROM players; DELETE FROM games; DELETE FROM members; DELETE FROM admins; DELETE FROM teams;",
	`INSERT INTO teams (id, name, code, season_start, ask_name, created_at) VALUES ('${team}', 'Saints U12 Boys 12.1', 'b12.1', 2026, 'Sam', '${now}');`,
	`INSERT INTO members (id, team_id, email, name, role, created_at) VALUES (1, '${team}', '${email}', 'Sam Rivers', 'manager', '${now}'),
	 (2, '${team}', 'coach@saints.example', 'Alex Coach', 'coach', '${now}'), (3, '${team}', 'parent@saints.example', 'Jordan Appleby', 'filmer', '${now}'),
	 (4, '${team}', 'grandma@saints.example', 'Nan Birchwood', 'watcher', '${now}');`,
	`INSERT INTO admins (email, added_by, added_at) VALUES ('${email}', 'npm run dev:seed', '${now}');`,
	`INSERT INTO players (team_id, number, name) VALUES ('${team}', 3, 'Chris'), ('${team}', 6, 'LeBron'), ('${team}', 11, 'Kyrie'), ('${team}', 13, 'Paolo'), ('${team}', 23, 'Jordan'),
	 ('${team}', 30, 'Steph'), ('${team}', 34, 'Giannis'), ('${team}', 35, 'Kevin'), ('${team}', 41, 'Dirk'), ('${team}', 99, 'Jae');`,
	...games.map(([at, comp, round, opp, venue], i) => `INSERT INTO games (id, team_id, starts_at, competition, round_label, opponent, venue, created_by, live_stream) VALUES (${i + 1}, '${team}', '${at}', '${comp}', '${round}', '${opp}', '${venue}', 1, ${i % 2});`),
	...games.flatMap(([, , , , , ours, theirs], i) => (ours === null ? [] : [`INSERT INTO game_scores (team_id, game_id, ours, opponent, source, entered_by, entered_at) VALUES ('${team}', ${i + 1}, ${ours}, ${theirs}, 'manual', 1, '${now}');`])),
	`INSERT INTO roster_families (team_id, surname) VALUES ('${team}', 'Appleby'), ('${team}', 'Birchwood'), ('${team}', 'Cresswell'), ('${team}', 'Rivers'), ('${team}', 'Okafor'), ('${team}', 'Lindqvist');`,
].join("\n");

const dir = join(LOCAL_STATE, "v3", "d1", "miniflare-D1DatabaseObject");
const files = readdirSync(dir).filter((f) => f.endsWith(".sqlite")).sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
if (!files.length) throw new Error(`no local database in ${dir}: run npm run dev:db first`);
const db = new DatabaseSync(join(dir, files[0]));
db.exec("PRAGMA foreign_keys = ON");
db.exec(sql);
db.close();
console.log(`dev:seed: the Saints' example season is in the local database; ${email} is its team manager and a site admin.`);
