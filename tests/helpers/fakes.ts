import type { AppConfig } from "../../src/app/config.ts";
import type { ExchangeRates } from "../../src/platform/exchange-rates.ts";
import type { TurnstilePort, TurnstileResult } from "../../src/platform/turnstile.ts";
import type { TeamDeps } from "../../src/app/deps.ts";
import type { Team } from "../../src/features/teams/team.ts";
import type { ClipRequest, Clipper } from "../../src/platform/stream-clips.ts";
import type { ImagesPort, PhotoVariant } from "../../src/platform/hosted-images.ts";
import type { OriginalsPort, UploadedPart } from "../../src/platform/r2-originals.ts";
import type { Presigner, StoredPart } from "../../src/platform/r2-presigner.ts";
import type { DownloadState, StreamPort, StreamVideoState } from "../../src/platform/stream-client.ts";
import type {LiveInput, LivePort} from "../../src/platform/stream-live.ts";
import type { LiveRecording } from "../../src/platform/stream-live-app.ts";
import type { PlayhqPort, PlayhqResult, PlayhqTeamFixture } from "../../src/platform/playhq.ts";
import type { AiPort, ModelStanding } from "../../src/platform/workers-ai.ts";
import { createTestDb } from "./d1-sqlite.ts";
import type { EmailPort, OutgoingEmail } from "../../src/platform/email.ts";
import type { JoinAnswer, JoinerPort, JoinRequest, JoinResult } from "../../src/platform/joiner.ts";

export const TEST_CONFIG: AppConfig = {
	accountId: "acct", streamCustomerCode: "cust",
	r2Bucket: "courtside-originals", streamKeyId: "k", streamKeyJwk: "j",
	r2AccessKeyId: "a", r2SecretAccessKey: "s", streamApiToken: "t", turnstileSiteKey: "0xSITEKEY", turnstileSecret: "ts", devAuthEmail: null, staging: false, workerName: "courtside", cloudflareInsights: null,
};

export class FakeStream implements StreamPort {
	videos = new Map<string, StreamVideoState>();
	downloads = new Map<string, DownloadState>();
	uploads: Array<{ url: string; uid: string; scheduledDeletion?: string; meta: Record<string, string> }> = [];
	deleted: string[] = [];
	failNextUpload = false;
	private next = 1;
	async uploadFromUrl(url: string, o: { scheduledDeletion?: string; meta: Record<string, string> }) {
		if (this.failNextUpload) { this.failNextUpload = false; throw new Error("stream unavailable"); }
		const uid = `uid-${this.next++}`;
		this.uploads.push({ url, uid, ...o });
		this.videos.set(uid, { readyToStream: false, state: "queued", errorReason: "", durationSeconds: -1 });
		return uid;
	}
	/** Videos Stream fails to answer for, as in an outage. */
	broken = new Set<string>();
	// Like the real client: null for a video Stream doesn't have.
	async details(uid: string) {
		if (this.broken.has(uid)) throw new Error(`Stream GET ${uid} failed (503): no details`);
		return this.videos.get(uid) ?? null;
	}
	/** Videos whose HD request Stream refuses, as in a hiccup. */
	downloadRequestFails = new Set<string>();
	// Like the real client: no download for a video Stream doesn't have.
	async generateDownload(uid: string) {
		if (this.downloadRequestFails.has(uid)) throw new Error(`Stream POST ${uid}/downloads failed (503): no details`);
		if (!this.videos.has(uid)) throw new Error(`Stream video ${uid} not found`);
		this.downloads.set(uid, "inprogress");
	}
	async downloadStatus(uid: string) { return this.downloads.get(uid) ?? "none"; }
	/** Deletes Stream fails, as in an outage. */
	deleteFails = new Set<string>();
	async deleteVideo(uid: string) {
		if (this.deleteFails.has(uid)) throw new Error(`Stream DELETE ${uid} failed (503): no details`);
		this.deleted.push(uid);
		return this.videos.delete(uid) ? "deleted" as const : "already_gone" as const;
	}
	/** When each video was made; anything not set here counts as made long ago. */
	created = new Map<string, string>();
	/** Videos staging made (labelled site "staging": platform/site-label.ts). */
	staging = new Set<string>();
	/** Recordings Stream made of a live input's broadcast (an external app's), by the input. */
	recordedFrom = new Map<string, string>();
	async listVideos() {
		return [...this.videos.keys()].filter((uid) => !this.deleted.includes(uid))
			.map((uid) => ({ uid, created: this.created.get(uid) ?? "2026-01-01T00:00:00.000Z", site: this.staging.has(uid) ? "staging" : null, liveInput: this.recordedFrom.get(uid) ?? null }));
	}
	/** The team put on each video afterwards (a live recording, which Stream labels with only a name). */
	labels = new Map<string, Record<string, string>>();
	async label(uid: string, meta: Record<string, string>) { this.labels.set(uid, meta); }
}

const sha256Hex = async (text: string) =>
	[...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

export class FakeOriginals implements OriginalsPort {
	/** The test clock, for when each object was written. */
	constructor(private readonly clock: () => Date = () => new Date()) {}
	created = new Map<string, string>();
	completed: Array<{ key: string; parts: UploadedPart[] }> = [];
	aborted: string[] = [];
	removed: string[] = [];
	puts = new Map<string, { body: string; contentType: string; custom: Record<string, string>; uploaded: string }>();
	async createMultipart(key: string) { const id = `up-${this.created.size + 1}`; this.created.set(key, id); return id; }
	/** Like R2, a multipart upload can only be completed once. */
	async complete(key: string, _id: string, parts: UploadedPart[]) {
		if (await this.exists(key)) throw new Error("R2 complete failed: NoSuchUpload");
		this.completed.push({ key, parts });
	}
	async exists(key: string) { return this.completed.some((c) => c.key === key); }
	async abort(key: string) { this.aborted.push(key); }
	async remove(key: string) { this.removed.push(key); this.puts.delete(key); }
	/** Set to make the next write store different bytes than were sent (R2 would refuse it, given a sha256). */
	corruptNextPut = false;
	async put(key: string, body: string, contentType: string, o: { sha256?: string; custom?: Record<string, string> } = {}) {
		const stored = this.corruptNextPut ? body.slice(0, -10) : body;
		this.corruptNextPut = false;
		if (o.sha256 && o.sha256 !== (await sha256Hex(stored))) throw new Error("R2 put failed: the sha256 doesn't match the body");
		this.puts.set(key, { body: stored, contentType, custom: o.custom ?? {}, uploaded: this.clock().toISOString() });
	}
	async list(prefix: string) {
		return [...this.puts.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b))
			.map(([key, v]) => ({ key, size: new TextEncoder().encode(v.body).byteLength, uploaded: v.uploaded, custom: v.custom }));
	}
}

/** R2's S3 side: signed links, and the parts that reached each upload (`parts`, by upload id; `gone` once R2 drops it). */
export class FakePresigner implements Presigner {
	parts = new Map<string, StoredPart[]>();
	gone = new Set<string>();
	async partUrl(key: string, uploadId: string, n: number) { return `https://r2.test/${key}?partNumber=${n}&uploadId=${uploadId}`; }
	async getUrl(key: string, o: { downloadName?: string }) { return `https://r2.test/${key}?get=1&name=${encodeURIComponent(o.downloadName ?? "")}`; }
	async putUrl(key: string) { return `https://r2.test/${key}?put=1`; }
	async listParts(_key: string, uploadId: string) { return this.gone.has(uploadId) ? null : [...(this.parts.get(uploadId) ?? [])]; }
}

/** Clips land in the FakeStream as queued videos, like real ones. */
export class FakeClipper implements Clipper {
	requests: ClipRequest[] = [];
	failNext: false | string = false;
	constructor(private stream: FakeStream) {}
	async clip(r: ClipRequest) {
		if (this.failNext) { const message = this.failNext; this.failNext = false; throw new Error(message); }
		this.requests.push(r);
		const uid = `clip-${this.requests.length}`;
		this.stream.videos.set(uid, { readyToStream: false, state: "queued", errorReason: "", durationSeconds: -1 });
		return uid;
	}
}

/** Live inputs in memory. Tests add an input to `connected` to simulate a phone streaming to it from Go live. */
export class FakeLive implements LivePort {
	inputs = new Map<string, { name: string; enabled: boolean; teamId?: string; site?: string }>();
	connected = new Set<string>();
	/** Stream unreachable: every call fails, as the real client's would. */
	down = false;
	private created = 0;
	private reach() { if (this.down) throw new Error("Stream live GET failed (503): no details"); }
	async createInput(name: string, teamId: string): Promise<LiveInput> {
		this.reach();
		const uid = `live-${++this.created}`;
		this.inputs.set(uid, { name, enabled: true, teamId });
		return (await this.getInput(uid))!;
	}
	async getInput(uid: string): Promise<LiveInput | null> {
		this.reach();
		if (!this.inputs.has(uid)) return null;
		return { uid, whipUrl: `https://customer-dev.cloudflarestream.com/whip-${uid}/webRTC/publish` };
	}
	async isConnected(uid: string) {
		this.reach();
		return this.connected.has(uid) && this.inputs.has(uid);
	}
	/** Tests add an input here to simulate an external app streaming to it over RTMPS, and its recordings as Stream makes them. */
	appConnectedTo = new Set<string>();
	recordingsOf = new Map<string, LiveRecording[]>();
	together = new Map<string, number>();
	async appAddress(uid: string) { this.reach(); return this.inputs.has(uid) ? { url: "rtmps://live.cloudflare.com:443/live/", streamKey: `key-${uid}` } : null; }
	async appConnected(uid: string) { this.reach(); return this.appConnectedTo.has(uid) && this.inputs.get(uid)?.enabled === true; }
	async recordings(uid: string) { this.reach(); return this.recordingsOf.get(uid) ?? []; }
	async keepTogether(uid: string, seconds: number) { this.reach(); if (!this.inputs.has(uid)) throw new Error(`FakeLive: unknown input ${uid}`); this.together.set(uid, seconds); }
	// Like Stream: switching off a deleted input is a no-op, switching one on fails.
	async disableInput(uid: string) { this.reach(); const input = this.inputs.get(uid); if (input) input.enabled = false; }
	async enableInput(uid: string) {
		this.reach();
		const input = this.inputs.get(uid);
		if (!input) throw new Error(`FakeLive: unknown input ${uid}`);
		input.enabled = true;
	}
	createdAt = new Map<string, string>();
	deletedInputs: string[] = [];
	async listInputs() {
		this.reach();
		return [...this.inputs].map(([uid, i]) => ({ uid, created: this.createdAt.get(uid) ?? "2026-01-01T00:00:00.000Z", site: i.site ?? null }));
	}
	async deleteInput(uid: string) { this.reach(); this.deletedInputs.push(uid); return this.inputs.delete(uid) ? "deleted" as const : "already_gone" as const; }
	usage = { usedMinutes: 65, limitMinutes: 1100 };
	async storage() {
		this.reach();
		return this.usage;
	}
}

/** PlayHQ teams in memory, by team id. `down` makes every read fail. */
export class FakePlayhq implements PlayhqPort {
	teams = new Map<string, PlayhqTeamFixture>();
	reads: string[] = [];
	/** Each game's result by PlayHQ game id; resultReads: the games asked about, in order. */
	results = new Map<string, PlayhqResult>();
	resultReads: string[] = [];
	down = false;
	async teamFixture(tenant: string, teamId: string) {
		this.reads.push(`${tenant}/${teamId}`);
		if (this.down) throw new Error("PlayHQ fixture failed (503): no details");
		const team = this.teams.get(teamId);
		return team ? structuredClone(team) : null;
	}
	async gameResult(_tenant: string, gameId: string) {
		this.resultReads.push(gameId);
		if (this.down) throw new Error("PlayHQ result failed (503): no details");
		const result = this.results.get(gameId);
		return result ? structuredClone(result) : null;
	}
}

/** Workers AI without the AI. answer: records the question, replies `reply`, or fails when `down`.
 * readJson: records the text it was given and returns `json` (set by the test). */
export class FakeAi implements AiPort {
	asked: Array<{ system: string; question: string }> = [];
	explained: Array<{ system: string; question: string }> = [];
	read: string[] = [];
	readSystem: string[] = [];
	reply = "Tap **Watch games** and choose a game.";
	json: unknown = { games: [] };
	down = false;
	async answer(system: string, question: string) {
		if (this.down) throw new Error("Workers AI: daily free allocation used up");
		this.asked.push({ system, question });
		return this.reply;
	}
	async explain(system: string, question: string) {
		if (this.down) throw new Error("Workers AI: daily free allocation used up");
		this.explained.push({ system, question });
		return this.reply;
	}
	async readJson(system: string, text: string) {
		if (this.down) throw new Error("Workers AI: daily free allocation used up");
		this.read.push(text);
		this.readSystem.push(system);
		return structuredClone(this.json);
	}
	/** The catalog's word on the site's model: current, unless a test says otherwise. */
	models: ModelStanding[] = [
		{ model: "@cf/google/gemma-4-26b-a4b-it", use: "Ask Virtual Team Manager, the Documentation assistant and reading fixture pages", listed: true, retiresOn: null },
	];
	async retirements() {
		if (this.down) throw new Error("Workers AI: the catalog didn't answer");
		return structuredClone(this.models);
	}
}

/** Cloudflare Images in memory: each photo's bytes, team, who added it and when (the test clock). `down` makes every
 * call fail, as in an outage; `failNextUpload` fails just the next upload. */
export class FakeImages implements ImagesPort {
	constructor(private readonly clock: () => Date = () => new Date()) {}
	stored = new Map<string, { bytes: Uint8Array; teamId: string; uploadedBy: number; filename?: string; uploaded: string; site?: string }>();
	deleted: string[] = [];
	down = false;
	failNextUpload = false;
	private next = 1;
	private reach() { if (this.down) throw new Error("Images unavailable (503)"); }
	async upload(bytes: Uint8Array, o: { teamId: string; uploadedBy: number; filename: string }) {
		this.reach();
		if (this.failNextUpload) { this.failNextUpload = false; throw new Error("Images upload failed (500)"); }
		const id = `img-${this.next++}`;
		this.stored.set(id, { bytes: bytes.slice(), ...o, uploaded: this.clock().toISOString() });
		return id;
	}
	async url(imageId: string, variant: PhotoVariant) { this.reach(); return `https://imagedelivery.test/${imageId}/${variant}?exp=1`; }
	async bytes(imageId: string) {
		this.reach();
		const image = this.stored.get(imageId);
		return image ? new Response(image.bytes).body : null;
	}
	// Like Images: deleting one that's gone already says so.
	async delete(imageId: string) {
		this.reach();
		this.deleted.push(imageId);
		return this.stored.delete(imageId) ? "deleted" as const : "already_gone" as const;
	}
	async list() {
		this.reach();
		return [...this.stored].map(([id, image]) => ({ id, uploaded: image.uploaded, site: image.site ?? null }));
	}
}

/** Emails the site sent, or the code the next send fails with; `down`: every send fails, as in an outage. */
export class FakeEmail implements EmailPort {
	sent: OutgoingEmail[] = [];
	failNext: string | null = null;
	down = false;
	async send(email: OutgoingEmail) {
		if (this.down) throw new Error("Email failed (E_INTERNAL_SERVER_ERROR): the binding is down");
		if (this.failNext) {
			const code = this.failNext;
			this.failNext = null;
			throw new Error(`Email failed (${code}): the binding refused it`);
		}
		this.sent.push(email);
	}
}

/** The joiner in memory. A join is begun by one ask (`started`) and told by a later one: `result` is how it ends,
 * `slow` keeps it running, `lose()` forgets what's running (a container that restarted), `down` fails every call. */
export class FakeJoiner implements JoinerPort {
	asked: JoinRequest[] = [];
	started: string[] = [];
	result: JoinResult = { ok: true, bytes: 1_000_000, seconds: 12 };
	down = false;
	slow = false;
	selfTests = 0;
	/** Runs as a finished join is told: a test's chance to land the file after the site looked for it. */
	whenDone?: () => void;
	private jobs = new Set<string>();
	lose() { this.jobs.clear(); }
	async join(req: JoinRequest): Promise<JoinAnswer> {
		if (this.down) throw new Error("joiner: HTTP 503");
		this.asked.push(req);
		const id = req.output.split("?")[0]!;
		if (this.jobs.has(id)) {
			if (this.slow) return { ok: true, state: "running" };
			this.jobs.delete(id);
			this.whenDone?.();
			return this.result.ok ? { ...this.result, state: "done" } : { ...this.result, state: "failed" };
		}
		if (!req.start) return { ok: true, state: "none" };
		this.jobs.add(id);
		this.started.push(id);
		return { ok: true, state: "running", started: true };
	}
	async selfTest() { if (this.down) throw new Error("joiner: HTTP 503"); this.selfTests++; return structuredClone(this.result); }
}

/** Turnstile's answer for every check (`result`), and what was asked. */
export class FakeTurnstile implements TurnstilePort {
	result: TurnstileResult = "ok";
	calls: Array<{ token: string; ip: string; hostname: string }> = [];
	async verify(token: string, ip: string, hostname: string) {
		this.calls.push({ token, ip, hostname });
		return { result: this.result, detail: this.result === "ok" ? "" : "fake" };
	}
}

/** The day's exchange rate: 1.5 Australian dollars to the US dollar (round, so tests can work it out); `down` fails it. */
export class FakeRates implements ExchangeRates {
	localPerUsd = 1.5;
	date = "2026-11-13";
	down = false;
	calls = 0;
	async usdToLocal() {
		this.calls++;
		if (this.down) throw new Error("Frankfurter: down");
		return { localPerUsd: this.localPerUsd, date: this.date };
	}
}

/** B12.1 as migration 0025 leaves it: the team every test runs in unless it says otherwise (withTeam). */
export const B12_1: Team = { id: "b12.1-2026", code: "b12.1", name: "Saints U12 Boys 12.1", seasonStart: 2026, askName: "Sam", status: "active", closedAt: null, deleteAfter: null };

export type TestDeps = TeamDeps & {
	stream: FakeStream; originals: FakeOriginals; presigner: FakePresigner; clipper: FakeClipper; live: FakeLive; playhq: FakePlayhq; ai: FakeAi;
	images: FakeImages; email: FakeEmail; turnstile: FakeTurnstile; rates: FakeRates; joiner: FakeJoiner;
};

export function createTestDeps(now = new Date("2026-10-15T00:00:00Z")): TestDeps {
	const stream = new FakeStream();
	return {
		db: createTestDb(), config: TEST_CONFIG, team: B12_1, now: () => now, device: "",
		stream, originals: new FakeOriginals(() => now), clipper: new FakeClipper(stream), live: new FakeLive(), playhq: new FakePlayhq(), ai: new FakeAi(),
		presigner: new FakePresigner(), images: new FakeImages(() => now), email: new FakeEmail(), cloudflare: null, billing: null, joiner: new FakeJoiner(),
		// The files in public/, as the ASSETS binding would serve them (plain text here: what's in them isn't the point).
		assets: { fetch: async (req) => new Response(`file ${new URL(req.url).pathname}`, { headers: { "Content-Type": "text/plain" } }) },
		tokens: { sign: async (uid, o) => `tok-${uid}${o?.downloadable ? "-dl" : ""}` },
		turnstile: new FakeTurnstile(), rates: new FakeRates(),
	};
}
