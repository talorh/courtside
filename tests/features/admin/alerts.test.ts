import { afterEach, describe, expect, it, vi } from "vitest";
import { setAlert } from "../../../src/features/admin/alerts-service.ts";
import { retryTicketEmails } from "../../../src/features/admin/support-desk-service.ts";
import { checkEmails } from "../../../src/features/admin/usage-checks.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

afterEach(() => vi.restoreAllMocks());

/** Test deps whose clock moves on: `at(iso)` sets it. */
function clocked(start = "2026-10-15T00:00:00.000Z") {
	let now = new Date(start);
	const deps = { ...createTestDeps(), now: () => now } as TestDeps;
	return { deps, at: (iso: string) => { now = new Date(iso); } };
}
const alertRow = (deps: TestDeps, kind = "stream_storage") => deps.db.prepare("SELECT level, detail, since, ticket_id FROM platform_alerts WHERE kind = ?").bind(kind).first();
const tickets = async (deps: TestDeps) => (await deps.db.prepare("SELECT id, source, alert_kind, title, status, resolved_by FROM support_requests ORDER BY id").all()).results;
const events = async (deps: TestDeps, id = 1) => (await deps.db.prepare("SELECT kind, body, email_to FROM support_messages WHERE request_id = ? ORDER BY id").bind(id).all()).results;
const subjects = (deps: TestDeps) => deps.email.sent.map((e) => e.subject);

describe("alerts raise tickets, only when there's something to do (nobody's spammed)", () => {
	it("opens a ticket from the site when an alert starts, emailed to the admins once, and no reminders while it stays", async () => {
		const { deps, at } = clocked("2026-10-14T22:10:00.000Z");
		await setAlert(deps, "stream_storage", "ok", "900 minutes left");
		expect([await tickets(deps), deps.email.sent]).toEqual([[], []]);
		await setAlert(deps, "stream_storage", "warn", "150 minutes left");
		expect(await tickets(deps)).toEqual([{ id: 1, source: "site", alert_kind: "stream_storage", title: "Video storage is running low", status: "new", resolved_by: null }]);
		expect(await alertRow(deps)).toEqual({ level: "warn", detail: "150 minutes left", since: "2026-10-14T22:10:00.000Z", ticket_id: 1 });
		expect(deps.email.sent).toEqual([{ to: ["sam@saints.example"], subject: "Courtside: Video storage is running low (#1)", text: `Video storage is running low: 150 minutes left.
Since Thu 15 Oct 2026, 9:10am.

What to do: buy more Stream storage in the Cloudflare dashboard (Stream, US$5 a month per 1,000 minutes). When it's full, uploads and live streams stop.

The ticket: https://saints.example/admin/support/1` }]);
		at("2026-10-14T23:10:00.000Z");
		await setAlert(deps, "stream_storage", "warn", "140 minutes left");
		at("2026-10-16T00:00:00.000Z");
		await setAlert(deps, "stream_storage", "warn", "120 minutes left");
		expect(deps.email.sent).toHaveLength(1);
		expect(await tickets(deps)).toHaveLength(1);
	});

	it("adds to the same ticket when it gets worse, with one email; better but still on is a line, no email", async () => {
		const { deps } = clocked();
		await setAlert(deps, "stream_storage", "warn", "150 minutes left");
		await setAlert(deps, "stream_storage", "urgent", "No minutes left");
		await setAlert(deps, "stream_storage", "warn", "180 minutes left");
		expect(subjects(deps)).toEqual(["Courtside: Video storage is running low (#1)", "Courtside: Video storage is full, now urgent (#1)"]);
		expect(await events(deps)).toEqual([
			{ kind: "event", body: "Worse: video storage is full: No minutes left.", email_to: "admins" },
			{ kind: "event", body: "Better, but still on: 180 minutes left.", email_to: null },
		]);
		expect(await tickets(deps)).toHaveLength(1);
	});

	it("resolves its ticket by itself when it clears, saying so, with no email; if it comes back, that's a new ticket", async () => {
		const { deps } = clocked();
		await setAlert(deps, "daily_job", "urgent", "The backup failed");
		await setAlert(deps, "daily_job", "ok", "Last night's job was fine");
		expect(await tickets(deps)).toMatchObject([{ id: 1, title: "The 3am job failed", status: "resolved", resolved_by: "site" }]);
		expect(await events(deps)).toEqual([{ kind: "event", body: "Cleared: Last night's job was fine. Resolved by itself.", email_to: null }]);
		expect(deps.email.sent).toHaveLength(1);
		await setAlert(deps, "daily_job", "urgent", "The clean-up failed");
		expect((await tickets(deps)).map((t) => [t.id, t.status])).toEqual([[1, "resolved"], [2, "new"]]);
	});

	it("leaves a ticket an admin resolved alone while its alert stays on", async () => {
		const { deps } = clocked();
		await setAlert(deps, "images", "warn", "81,000 photos stored");
		await makeClient(deps)("/admin/support/1/status", form({ status: "resolved" }));
		await setAlert(deps, "images", "warn", "82,000 photos stored");
		expect(await tickets(deps)).toHaveLength(1);
		await setAlert(deps, "images", "urgent", "96,000 photos stored");
		expect((await tickets(deps)).map((t) => [t.id, t.status, t.title])).toEqual([[1, "resolved", "Photos are near Images' 100,000"], [2, "new", "Photos are nearly at Images' 100,000"]]);
	});

	it("puts the ticket's name right and moves it up the queue when it gets worse", async () => {
		const { deps, at } = clocked();
		await setAlert(deps, "stream_storage", "warn", "150 minutes left");
		at("2026-10-15T03:00:00.000Z");
		await setAlert(deps, "stream_storage", "urgent", "No minutes left");
		expect(await deps.db.prepare("SELECT title, updated_at FROM support_requests WHERE id = 1").first())
			.toEqual({ title: "Video storage is full", updated_at: "2026-10-15T03:00:00.000Z" });
		expect(subjects(deps)).toEqual(["Courtside: Video storage is running low (#1)", "Courtside: Video storage is full, now urgent (#1)"]);
	});

	it("never sends the first email of a ticket that's resolved before it could go, and doesn't count it as waiting", async () => {
		const { deps, at } = clocked();
		vi.spyOn(console, "error").mockImplementation(() => {});
		deps.email.failNext = "E_INTERNAL_SERVER_ERROR";
		await setAlert(deps, "images", "warn", "81,000 photos stored");
		await setAlert(deps, "images", "ok", "70,000 photos stored");
		at("2026-10-15T02:00:00.000Z");
		await retryTicketEmails(deps);
		await checkEmails(deps);
		expect(deps.email.sent).toEqual([]);
		expect(await alertRow(deps, "email")).toMatchObject({ level: "ok", detail: "No emails waiting to go" });
	});

	it("still saves the alert and its ticket when the email fails; the 5-minute job sends it", async () => {
		const { deps } = clocked();
		deps.email.failNext = "E_SENDER_NOT_VERIFIED";
		vi.spyOn(console, "error").mockImplementation(() => {});
		await setAlert(deps, "sync_job", "urgent", "6 runs in a row failed: Error: Stream said 500");
		expect(await tickets(deps)).toMatchObject([{ id: 1, title: "The 5-minute job keeps failing", status: "new" }]);
		expect(deps.email.sent).toEqual([]);
		await retryTicketEmails(deps);
		expect(subjects(deps)).toEqual(["Courtside: The 5-minute job keeps failing (#1)"]);
	});
});
