import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../src/app/handle-request.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { heldEmails, signInFigures } from "../../src/auth/sign-in-codes-repository.ts";
import { LIMITS } from "../../src/auth/sign-in-limits.ts";
import { requestCode } from "../../src/auth/sign-in-service.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { MANAGER } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addMember } from "../helpers/two-teams.ts";

// Codes asked for at the same moment: each is counted before the limits are looked at, so requests that overlap (an
// email takes a while to go) can't all see the same count and all be sent. A code whose email doesn't go isn't counted.

afterEach(() => vi.restoreAllMocks());

function clocked() {
	let now = new Date("2026-10-31T09:00:00.000Z");
	const deps = createTestDeps();
	deps.now = () => now;
	vi.spyOn(console, "log").mockImplementation(() => {});
	return { deps, later: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

/** Every email takes `ms` to go, so the requests that start together are all in flight at once. */
function slowEmail(deps: TestDeps, ms = 30) {
	const send = deps.email.send.bind(deps.email);
	deps.email.send = async (m) => { await new Promise((r) => setTimeout(r, ms)); return send(m); };
}

const together = (n: number, ask: (i: number) => Promise<string>) => Promise.all(Array.from({ length: n }, (_, i) => ask(i)));
const codeSentRows = async (deps: TestDeps) => (await deps.db.prepare("SELECT COUNT(*) AS n FROM sign_in_events WHERE kind = 'code_sent'").first<number>("n")) ?? 0;
const seedCodesSent = async (deps: TestDeps, n: number, ip: (i: number) => string) => {
	for (let i = 0; i < n; i++) {
		await deps.db.prepare("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('code_sent', ?, ?, ?)").bind(`other${i}@x.com`, ip(i), "2026-10-31T08:55:00.000Z").run();
	}
};

describe("codes asked for together", () => {
	it("stop at an address's 10 an hour on the sign-in page, however many are posted at once", async () => {
		const { deps } = clocked();
		slowEmail(deps);
		const refuse = async (): Promise<string> => { throw new Error("not signed in"); };
		const post = (i: number) => handleRequest(new Request("https://saints.example/signin", {
			method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "203.0.113.7" },
			body: new URLSearchParams({ email: MANAGER, next: "/", "cf-turnstile-response": `tok-${i}` }),
		}), deps, refuse, buildRouter(), buildAdminRouter());
		const statuses = (await Promise.all(Array.from({ length: 25 }, (_, i) => post(i)))).map((r) => r.status);
		expect(statuses.filter((s) => s === 200)).toHaveLength(LIMITS.emailPerHour);
		expect(statuses.filter((s) => s === 429)).toHaveLength(25 - LIMITS.emailPerHour);
		expect(deps.email.sent).toHaveLength(LIMITS.emailPerHour);
		expect(await signInFigures(deps.db, "2026-10-31T00:00:00.000Z")).toMatchObject({ codesSent: LIMITS.emailPerHour, refused: 25 - LIMITS.emailPerHour });
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([{ email: MANAGER, until: "2026-10-31T09:15:00.000Z" }]);
	});
	it("stop at an address's 20 a day, from any number of IP addresses", async () => {
		const { deps, later } = clocked();
		for (let h = 0; h < 2; h++) {
			for (let i = 0; i < LIMITS.emailPerHour - 1; i++) expect(await requestCode(deps, MANAGER, `10.${h}.0.${i}`)).toBe("sent");
			later(61 * 60_000);
		}
		slowEmail(deps);
		const answers = await together(10, (i) => requestCode(deps, MANAGER, `10.9.0.${i}`));
		expect(answers.filter((a) => a === "sent")).toHaveLength(2);
		expect(deps.email.sent).toHaveLength(LIMITS.emailPerDay);
		expect(await codeSentRows(deps)).toBe(LIMITS.emailPerDay);
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([{ email: MANAGER, until: "2026-11-01T11:02:00.000Z" }]);
	});
	it("stop at an IP address's 30 in 15 minutes, whoever they're for", async () => {
		const { deps } = clocked();
		for (let i = 0; i < 10; i++) await addMember(deps.db, deps.team.id, `p${i}@x.com`, "watcher");
		await seedCodesSent(deps, LIMITS.ipPer15m - 5, () => "9.9.9.9");
		slowEmail(deps);
		const answers = await together(10, (i) => requestCode(deps, `p${i}@x.com`, "9.9.9.9"));
		expect(answers.filter((a) => a === "sent")).toHaveLength(5);
		expect(deps.email.sent).toHaveLength(5);
		expect(await heldEmails(deps.db, deps.now().toISOString())).toEqual([]);
	});
	it("stop at the site's 200 an hour, and raise one Sign-in flood ticket", async () => {
		const { deps } = clocked();
		for (let i = 0; i < 10; i++) await addMember(deps.db, deps.team.id, `p${i}@x.com`, "watcher");
		await seedCodesSent(deps, LIMITS.sitePerHour - 5, (i) => `10.0.${i}.1`);
		slowEmail(deps);
		const answers = await together(10, (i) => requestCode(deps, `p${i}@x.com`, `10.8.0.${i}`));
		expect(answers.filter((a) => a === "sent")).toHaveLength(5);
		expect(answers.filter((a) => a === "limited")).toHaveLength(5);
		const tickets = await deps.db.prepare("SELECT alert_kind FROM support_requests").all();
		expect(tickets.results).toEqual([{ alert_kind: "signin_flood" }]);
	});
	it("don't count when their emails don't go, so the address still has its 10 an hour", async () => {
		const { deps } = clocked();
		slowEmail(deps);
		deps.email.down = true;
		const failed = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => requestCode(deps, MANAGER, `10.0.0.${i}`)));
		expect(failed.map((f) => f.status)).toEqual(Array(5).fill("rejected"));
		expect(await codeSentRows(deps)).toBe(0);
		deps.email.down = false;
		for (let i = 0; i < LIMITS.emailPerHour; i++) expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("sent");
		expect(await requestCode(deps, MANAGER, "1.2.3.4")).toBe("limited");
	});
});
