// npm run club -- placeholder | court | mark | all   The club's generated images (INSTALL.md, Branding):
//   placeholder  draws the stand-in logo set in the club's colours (public/logo.png, the icons, club-mark.webp), for a
//                club with no logo yet; a club's own files replace them (same names and sizes)
//   court        public/court.webp, the empty player's picture: a court in the club's colours with its logo and name
//   mark         src/ui/club-mark-inline.ts (the launch screen's copy of club-mark.webp) and maintenance/logo.ts
//   all          court, then mark
// Python 3 with Pillow and ImageMagick (magick) do the drawing; FONT names a bold condensed font file for the court.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const command = process.argv[2];
const fail = (text) => {
	console.error(`club: STOPPED. ${text}`);
	process.exit(1);
};
if (!["placeholder", "court", "mark", "all"].includes(command)) fail("Usage: npm run club -- placeholder | court | mark | all");

const club = readFileSync("src/club.ts", "utf8");
const field = (name) => new RegExp(`\\b${name}:\\s*"([^"]*)"`).exec(club)?.[1] ?? fail(`couldn't read ${name} from src/club.ts`);
const light = /light:\s*\{([^}]*)\}/.exec(club)?.[1] ?? fail("couldn't read the light colours from src/club.ts");
const colour = (name) => new RegExp(`\\b${name}:\\s*"(#[0-9A-Fa-f]{6})"`).exec(light)?.[1] ?? fail(`couldn't read colors.light.${name} from src/club.ts`);
const nickname = field("nickname"), bar = colour("bar"), button = colour("button");
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

if (command === "placeholder") run("python3", ["scripts/make-logo.py", bar, button]);
if (command === "court" || command === "all") {
	const font = process.env.FONT ?? "/usr/share/fonts/urw-base35/NimbusSansNarrow-Bold.otf";
	run("python3", ["scripts/make-court.py", "public/logo.png", "court.jpg", font, nickname.toUpperCase(), `HOME OF THE ${nickname.toUpperCase()}`, button, bar]);
	run("magick", ["court.jpg", "-quality", "78", "public/court.webp"]);
	run("rm", ["-f", "court.jpg"]);
	console.log("club: public/court.webp written");
}
if (command === "mark" || command === "all" || command === "placeholder") {
	const mark = readFileSync("public/club-mark.webp").toString("base64");
	writeFileSync("src/ui/club-mark-inline.ts", `// The club's mark (public/club-mark.webp) as a data: URL, for the launch screen to carry in the page itself
// (ui/landing-pages.ts). A plain constant, not a bundler's ?inline import: the browser suite loads the page code under
// Node, which can't import an image. tests/ui/club-mark-inline.test.ts holds it to the file; remake it when the file
// changes with: npm run club -- mark
export const CLUB_MARK = "data:image/webp;base64,${mark}";
`);
	run("node", ["scripts/maintenance-logo.mjs"]);
	console.log("club: src/ui/club-mark-inline.ts written");
}
