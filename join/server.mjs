// The joiner's server inside the container. POST /join answers at once: it begins the join a request names (the
// segments into one file on disk, pipeline.mjs, then uploaded to the request's PUT link), or says how the one already
// begun for that file is going or went (jobs.mjs). POST /self-test joins the two files shipped in the image and waits
// for the answer.
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { createJobs } from "./jobs.mjs";
import { parseJoinRequest, putFile, sizes, tenths, tooBig } from "./join.mjs";
import { joinSegments } from "./pipeline.mjs";

const PORT = 8080;

async function join(req, signal = undefined) {
	const started = Date.now();
	const inputBytes = await sizes(req.segments, signal);
	if (tooBig(inputBytes)) return { ok: false, reason: "the segments are over 3 GB together: too big to join" };
	const dir = await mkdtemp(joinPath(tmpdir(), "join-"));
	try {
		const out = joinPath(dir, `out.${req.container}`);
		const joined = await joinSegments(req.segments, out, req.container, inputBytes, dir, signal);
		if (!joined.ok) return joined;
		const joinedAt = Date.now();
		if (req.output) {
			const failed = await putFile(out, req.output, req.container === "webm" ? "video/webm" : "video/mp4", joined.bytes, signal);
			if (failed) return { ok: false, reason: failed };
		}
		return { ok: true, bytes: joined.bytes, seconds: Math.round((Date.now() - started) / 1000), took: { ...joined.took, store: tenths(Date.now() - joinedAt) } };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

const body = (req) => new Promise((resolve, reject) => { let text = ""; req.on("data", (d) => { text += d; }); req.on("end", () => resolve(text)); req.on("error", reject); });
const answer = (res, status, json) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(json));
const here = new URL(".", import.meta.url).pathname;
const jobs = createJobs(join);

createServer(async (req, res) => {
	try {
		if (req.method === "POST" && req.url === "/join") return answer(res, 200, jobs.ask(parseJoinRequest(JSON.parse(await body(req)))));
		if (req.method === "POST" && req.url === "/self-test") {
			return answer(res, 200, await join({ segments: [`file:${here}test-a.mp4`, `file:${here}test-b.mp4`], output: "", container: "mp4" }));
		}
		answer(res, 404, { ok: false, reason: "no such path" });
	} catch (err) {
		answer(res, 400, { ok: false, reason: err instanceof Error ? err.message : String(err) });
	}
}).listen(PORT, () => console.log(JSON.stringify({ event: "joiner_listening", port: PORT })));

// The platform stops the container with SIGTERM; as PID 1, Node only leaves on being told to.
process.on("SIGTERM", () => process.exit(0));
