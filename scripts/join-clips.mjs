// A game filmed in several clips (AirDropped to the team manager): put them in recording order and join them into one video to
// upload. Clips from the same phone and settings are joined as they are (fast, no quality lost). Clips that differ
// (another phone, 4K and 1080p, sideways one way then the other) stop with a list of the differences; add --reencode
// to convert them all to 1080p H.264 (slow). Needs ffmpeg and ffprobe.
// Usage: node scripts/join-clips.mjs [--keep-order] [--reencode] [-o joined.mov] clip1.mov clip2.mov ...
//   --keep-order  join in the order given instead of by recording time (if the phone's clock looks wrong)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? (args.splice(args.indexOf(name), 1), true) : false);
const keepOrder = flag("--keep-order"), reencode = flag("--reencode");
let out = null;
if (args.includes("-o")) out = args.splice(args.indexOf("-o"), 2)[1];
const fail = (msg) => { console.error(msg); process.exit(1); };
if (args.length < 2) fail("Give at least two clips. Usage: node scripts/join-clips.mjs [--keep-order] [--reencode] [-o out.mov] clip1 clip2 ...");
for (const f of args) if (!existsSync(f)) fail(`Can't find ${f}`);

// Recording start: iPhones store the local time with its zone; other phones store creation_time (UTC).
function startTime(tags) {
	const raw = tags["com.apple.quicktime.creationdate"] ?? tags.creation_time;
	const t = raw ? Date.parse(raw.replace(/([+-]\d\d)(\d\d)$/, "$1:$2")) : NaN;
	return Number.isNaN(t) ? null : t;
}

function probe(file) {
	const json = execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
	const { format, streams } = JSON.parse(json);
	const v = streams.find((s) => s.codec_type === "video"), a = streams.find((s) => s.codec_type === "audio");
	if (!v) fail(`${file} has no video in it`);
	const matrix = v.side_data_list?.find((d) => d.rotation !== undefined);
	return {
		file, start: startTime({ ...format.tags, ...v.tags }), seconds: Number(format.duration),
		hdr: ["arib-std-b67", "smpte2084"].includes(v.color_transfer),
		// What has to match for clips to be joined as they are.
		shape: {
			video: v.codec_name, size: `${v.width}x${v.height}`, frameRate: v.r_frame_rate, pixels: v.pix_fmt,
			turned: matrix?.rotation ?? Number(v.tags?.rotate ?? 0), colour: v.color_transfer ?? "unknown",
			audio: a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : "none",
		},
	};
}

const clips = args.map(probe);
if (!keepOrder) {
	if (clips.some((c) => c.start === null)) fail("A clip has no recording time, so it can't be sorted. List them in order and add --keep-order.");
	clips.sort((x, y) => x.start - y.start);
}

const clock = (ms) => new Date(ms).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", second: "2-digit" });
const length = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
console.log(keepOrder ? "Order (as given):" : "Order (by recording time):");
clips.forEach((c, i) => {
	const prev = clips[i - 1];
	const gap = prev && c.start !== null && prev.start !== null ? (c.start - prev.start) / 1000 - prev.seconds : null;
	const note = gap === null ? "" : gap >= 1 ? `, ${length(gap)} after the last clip ended` : gap < -5 ? ", overlaps the last clip?" : "";
	console.log(`  ${i + 1}. ${c.file}  ${c.start === null ? "" : `started ${clock(c.start)}, `}${length(c.seconds)}${note}`);
});
const total = clips.reduce((sum, c) => sum + c.seconds, 0);
console.log(`Total ${length(total)}.`);

const differences = Object.keys(clips[0].shape).filter((k) => new Set(clips.map((c) => c.shape[k])).size > 1);
if (differences.length && !reencode) {
	console.error("\nThese clips don't match, so they can't be joined as they are:");
	for (const k of differences) console.error(`  ${k}: ${clips.map((c, i) => `${i + 1}=${c.shape[k]}`).join("  ")}`);
	fail("Run again with --reencode to convert them all to 1080p (slow: roughly the length of the game, or longer).");
}

const ext = reencode ? ".mp4" : extname(clips[0].file).toLowerCase() || ".mov";
out = resolve(out ?? `joined-${new Date(clips[0].start ?? Date.now()).toISOString().slice(0, 10)}${ext}`);
if (existsSync(out)) fail(`${out} already exists; pick another name with -o`);
const firstStart = clips[0].start === null ? [] : ["-metadata", `creation_time=${new Date(clips[0].start).toISOString()}`];
const work = mkdtempSync(join(tmpdir(), "join-clips-"));
let ffmpeg;
try {
	if (!reencode) {
		// Same settings: ffmpeg's concat list copies the clips end to end. Only picture and sound are kept (phones add
		// extra data tracks that stop clips joining).
		const list = join(work, "list.txt");
		writeFileSync(list, clips.map((c) => `file '${resolve(c.file).replaceAll("'", "'\\''")}'`).join("\n") + "\n");
		const tag = clips[0].shape.video === "hevc" ? ["-tag:v", "hvc1"] : [];
		ffmpeg = ["-f", "concat", "-safe", "0", "-i", list, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", ...tag];
	} else {
		// Different settings: decode each clip (turned the right way up), fit it in 1080p at 30 fps, and encode once.
		const canTonemap = execFileSync("ffmpeg", ["-hide_banner", "-filters"]).toString().includes(" zscale ");
		if (clips.some((c) => c.hdr) && !canTonemap) console.warn("This ffmpeg has no zscale, so HDR clips will look washed out.");
		const toSdr = !canTonemap ? "" : "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,";
		const fit = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p";
		const parts = clips.map((c, i) => {
			const sound = c.shape.audio === "none" ? `anullsrc=r=48000:cl=stereo,atrim=duration=${c.seconds}` : `[${i}:a:0]aresample=48000`;
			return `[${i}:v:0]${c.hdr ? toSdr : ""}${fit}[v${i}];${sound},aformat=sample_rates=48000:channel_layouts=stereo[a${i}];`;
		});
		const joins = clips.map((_, i) => `[v${i}][a${i}]`).join("");
		ffmpeg = [...clips.flatMap((c) => ["-i", c.file]), "-filter_complex", `${parts.join("")}${joins}concat=n=${clips.length}:v=1:a=1[v][a]`,
			"-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-b:a", "160k"];
	}
	console.log(`\nJoining into ${out} ...`);
	const run = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-stats", "-n", ...ffmpeg, ...firstStart, out], { stdio: "inherit" });
	if (run.status !== 0) fail(`ffmpeg failed (exit ${run.status}). Nothing was uploaded; ${out} may be incomplete, delete it.`);
} finally {
	rmSync(work, { recursive: true, force: true });
}

const made = probe(out);
const off = Math.abs(made.seconds - total);
console.log(`Done: ${out} (${length(made.seconds)}).${off > 2 ? ` Expected ${length(total)}: check it before uploading.` : ""}`);
console.log("Upload it to the game as usual.");
