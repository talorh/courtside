import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLUB } from "../../src/club.ts";
import { loadBill } from "../../src/features/admin/costs-bill.ts";
import { DAILY_CRONS, dailyDue, runDaily } from "../../src/jobs/daily.ts";
import { SWEEP_RECORD } from "../../src/jobs/sweep-orphans.ts";
import { createTestDeps } from "../helpers/fakes.ts";

const at = (iso: string) => Date.parse(iso);

describe("the daily job keeps how its clean-up of videos and photos went (Workers Logs dropped a whole night)", () => {
	const leftBehind = (deps: ReturnType<typeof createTestDeps>, uid: string) => {
		deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 60 });
		deps.stream.created.set(uid, "2026-10-01T00:00:00.000Z");
	};
	it("beside the backup: when it ran, what it found left behind and what it removed", async () => {
		const deps = createTestDeps(new Date("2026-10-24T16:00:00Z"));
		leftBehind(deps, "old-test");
		const photo = await deps.images.upload(new Uint8Array([1]), { teamId: deps.team.id, uploadedBy: 1, filename: "photo.jpg" });
		deps.images.stored.get(photo)!.uploaded = "2026-10-01T00:00:00.000Z";
		await runDaily(deps);
		expect(deps.originals.puts.get(SWEEP_RECORD)?.custom).toEqual({ at: "2026-10-24T16:00:00.000Z", ok: "yes", found: "2", removed: "2", problem: "" });
	});
	it("and why it failed, when it does (the run still fails, for the logs)", async () => {
		const deps = createTestDeps(new Date("2026-10-24T16:00:00Z"));
		for (let i = 0; i < 8; i++) leftBehind(deps, `unknown-${i}`); // most of Stream unknown: refused
		await expect(runDaily(deps)).rejects.toThrow("daily: 1 problem(s)");
		expect(deps.originals.puts.get(SWEEP_RECORD)?.custom).toMatchObject({ ok: "no", removed: "0", problem: expect.stringContaining("Orphan sweep refused") });
		expect(deps.originals.puts.has("backups/d1/courtside-2026-10-25.sql")).toBe(true); // the backup went ahead
	});
});

describe("the daily job's time: 3am local, all year", () => {
	it("in daylight saving (AEDT) the 16:00 UTC trigger is 3am; in winter (AEST) the 17:00 UTC one is", () => {
		expect(dailyDue(at("2026-10-23T16:00:00Z"))).toBe(true);
		expect(dailyDue(at("2026-10-23T17:00:00Z"))).toBe(false);
		expect(dailyDue(at("2027-06-15T17:00:00Z"))).toBe(true);
		expect(dailyDue(at("2027-06-15T16:00:00Z"))).toBe(false);
	});
	it("runs exactly once on the nights the clocks change", () => {
		// Daylight saving starts 2am Sunday 4 Oct 2026 (clocks jump to 3am) and ends 3am Sunday 4 Apr 2027 (back to 2am).
		expect([dailyDue(at("2026-10-03T16:00:00Z")), dailyDue(at("2026-10-03T17:00:00Z"))]).toEqual([true, false]);
		expect([dailyDue(at("2027-04-03T16:00:00Z")), dailyDue(at("2027-04-03T17:00:00Z"))]).toEqual([false, true]);
	});
	it("has one trigger for each UTC hour the club config names, and the deploy config makes its triggers from the same hours", () => {
		expect(DAILY_CRONS).toEqual(new Set(CLUB.dailyJobUtcHours.map((h) => `0 ${h} * * *`)));
		const config = readFileSync("cloudflare.config.ts", "utf8");
		expect(config).toContain("CLUB.dailyJobUtcHours.map((h) => triggers.scheduled({ schedule: `0 ${h} * * *` }))");
	});
});

describe("the daily job keeps the sign-in's events, for the admin Log", () => {
	it("a month (31 days, so a whole calendar month is always there): older ones go", async () => {
		const deps = createTestDeps(new Date("2026-11-30T16:00:00Z"));
		const add = (at: string) => deps.db.prepare("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('code_sent', 'a@x.com', '', ?)").bind(at).run();
		await add("2026-10-30T16:30:00.000Z");
		await add("2026-10-29T15:30:00.000Z");
		await runDaily(deps).catch(() => {});
		const left = await deps.db.prepare("SELECT at FROM sign_in_events").all<{ at: string }>();
		expect(left.results.map((r) => r.at)).toEqual(["2026-10-30T16:30:00.000Z"]);
	});
});

describe("the daily job reads Cloudflare's bill for Costs", () => {
	const usage = { day: "2026-11-29", service: "Workers Standard Requests (first 10M are included)", family: "Workers", quantity: 1, billable: 0, unit: "Count", billed: 0, periodStart: "2026-11-16" };
	it("every night, whether or not Costs has read it today", async () => {
		let quantity = 1;
		const deps = { ...createTestDeps(new Date("2026-11-29T16:00:00Z")), billing: { usage: async () => [{ ...usage, quantity }] } };
		await loadBill(deps);
		quantity = 5;
		await runDaily(deps).catch(() => {});
		expect(await deps.db.prepare("SELECT quantity FROM billed_usage").first("quantity")).toBe(5);
	});
	it("and fails the night, for a person to look, when it can't", async () => {
		const deps = { ...createTestDeps(new Date("2026-11-29T16:00:00Z")), billing: { usage: async () => { throw new Error("403"); } } };
		const err = await runDaily(deps).catch((e: unknown) => e as AggregateError);
		expect(err?.errors?.map(String).join(" ")).toContain("Cloudflare's bill couldn't be read");
	});
});
