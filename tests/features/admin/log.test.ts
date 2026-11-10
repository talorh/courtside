import { afterEach, describe, expect, it, vi } from "vitest";
import { recordSignInEvent } from "../../../src/auth/sign-in-codes-repository.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember } from "../../helpers/two-teams.ts";
import { sheetRows } from "../../helpers/unzip.ts";

// The admin Log: what team managers change on their teams (with who did it), and what happened at the sign-in page,
// beside what admins did, as a table; chips choose which, and which days (the club's), or any dates typed in, and
// filters who, which team, which event, words, and device views hidden.

afterEach(() => vi.restoreAllMocks());

/** Each row of the table as "who what happened", with its address after "from" when it has one. */
const lines = async (deps: TestDeps, query = "") => {
	const page = await (await makeClient(deps)(`/admin/log${query}`)).text();
	return [...page.matchAll(/<tr class="lr">[^]*?<td class="l-who"><a [^>]*>([^<]*)<\/a><\/td>[^]*?<td class="l-what">([^]*?)<\/td>[^]*?<td class="l-ip">(?:<a class="l-addr" [^>]*>([^<]*)<\/a>)?<\/td><\/tr>/g)]
		.map((m) => `${m[1]} ${m[2]}${m[3] ? ` from ${m[3]}` : ""}`);
};

const who = async (deps: TestDeps, query = "") => (await lines(deps, query)).map((l) => l.split(" ")[0]);

describe("the admin Log", () => {
	it("has a line for each change a team manager makes to their people and players, saying who made it", async () => {
		const deps = createTestDeps();
		// The test team's squad is full: room for one.
		await deps.db.prepare("UPDATE players SET removed_at = '2026-10-01T00:00:00.000Z'").run();
		const client = makeClient(deps);
		await client("/members", form({ email: "mum@x.com", name: "Sam's mum", role: "watcher" }));
		const mum = (await deps.db.prepare("SELECT id FROM members WHERE email = 'mum@x.com'").first<{ id: number }>())!.id;
		await client(`/members/${mum}`, form({ name: "Sam's mum", role: "filmer" }));
		await client(`/members/${mum}/sign-in`, form({}));
		await client(`/members/${mum}/remove`, form({ confirm: "yes" }));
		await client("/players", form({ number: "1", name: "Zion" }));
		const steph = (await deps.db.prepare("SELECT id FROM players WHERE name = 'Zion'").first<{ id: number }>())!.id;
		await client(`/players/${steph}`, form({ number: "2", name: "Zion" }));
		await client(`/players/${steph}/remove`, form({ confirm: "yes" }));
		expect(await lines(deps, "?show=teams")).toEqual([
			`${MANAGER} took Zion #2 off Saints B12.1&#39;s squad`,
			`${MANAGER} changed Saints B12.1&#39;s player Zion #1 to Zion #2`,
			`${MANAGER} added Zion #1 to Saints B12.1&#39;s squad`,
			`${MANAGER} took Sam&#39;s mum (mum@x.com), watch and film off Saints B12.1`,
			`${MANAGER} let Sam&#39;s mum (mum@x.com) sign in again on Saints B12.1, ending their wait`,
			`${MANAGER} changed mum@x.com: watch only to watch and film on Saints B12.1`,
			`${MANAGER} added Sam&#39;s mum (mum@x.com) as watch only to Saints B12.1`,
		]);
		// Saving someone without changing anything adds no line.
		const before = (await lines(deps, "?show=teams")).length;
		await addMember(deps.db, deps.team.id, "dad@x.com", "watcher", "Dad");
		const dad = (await deps.db.prepare("SELECT id FROM members WHERE email = 'dad@x.com'").first<{ id: number }>())!.id;
		await client(`/members/${dad}`, form({ name: "Dad", role: "watcher" }));
		expect(await lines(deps, "?show=teams")).toHaveLength(before);
	});
	it("shows the sign-in page's events, each with the internet address it came from, and filters by kind", async () => {
		const deps = createTestDeps();
		const at = deps.now().toISOString();
		await recordSignInEvent(deps.db, { kind: "robot", email: "bot@x.com", ip: "9.9.9.9", at });
		await recordSignInEvent(deps.db, { kind: "wrong", email: MANAGER, ip: "1.2.3.4", at });
		await recordSignInEvent(deps.db, { kind: "desktop_view", email: MANAGER, ip: "1.2.3.4", at });
		await recordSignInEvent(deps.db, { kind: "mobile_view", email: "mum@x.com", ip: "", at });
		await makeClient(deps)("/members", form({ email: "mum@x.com", name: "", role: "watcher" }));
		const signIns = await lines(deps, "?show=signins");
		expect(signIns).toContain('bot@x.com was refused: the robot check (Turnstile) said no from 9.9.9.9');
		expect(signIns).toContain(`${MANAGER} typed a wrong code from 1.2.3.4`);
		// Which view each signed-in device uses, when it's first seen and when it changes.
		expect(signIns).toContain(`${MANAGER} is using the desktop view from 1.2.3.4`);
		expect(signIns).toContain("mum@x.com is using the mobile view");
		expect(await (await makeClient(deps)("/admin/log")).text()).toContain("and the sign-in page (kept a month), newest first, in local time, with the device each came from");
		expect(signIns.some((l) => l.includes("added"))).toBe(false);
		expect((await lines(deps)).some((l) => l.includes("added mum@x.com"))).toBe(true);
		expect((await lines(deps)).some((l) => l.includes("robot check"))).toBe(true);
		expect(await lines(deps, "?show=admins")).toEqual([]);
	});
	// The test clock: 11am Thursday 15 Oct 2026 in the club's time zone (00:00 UTC).
	const seeded = async () => {
		const deps = createTestDeps();
		const add = (email: string, at: string) => recordSignInEvent(deps.db, { kind: "code_sent", email, ip: "", at });
		await add("today@x.com", "2026-10-14T13:30:00.000Z"); // 12:30am on the 15th, local
		await add("yesterday@x.com", "2026-10-14T12:30:00.000Z"); // 11:30pm on the 14th
		await add("week@x.com", "2026-10-09T00:00:00.000Z");
		await add("month@x.com", "2026-10-08T00:00:00.000Z");
		await add("september@x.com", "2026-09-10T00:00:00.000Z");
		return deps;
	};

	it("shows the last 7 days in the club's time zone unless today, yesterday or the last month is chosen", async () => {
		const deps = await seeded();
		expect(await who(deps)).toEqual(["today@x.com", "yesterday@x.com", "week@x.com"]);
		expect(await who(deps, "?show=all&from=2026-10-15&to=2026-10-15")).toEqual(["today@x.com"]);
		expect(await who(deps, "?show=all&from=2026-10-14&to=2026-10-14")).toEqual(["yesterday@x.com"]);
		expect(await who(deps, "?show=all&from=2026-09-15&to=2026-10-15")).toEqual(["today@x.com", "yesterday@x.com", "week@x.com", "month@x.com"]);
		const page = await (await makeClient(deps)("/admin/log")).text();
		expect(page).toContain('<nav class="chips" aria-label="Which days"><a class="chip" href="/admin/log?show=all&amp;from=2026-10-15&amp;to=2026-10-15">Today</a><a class="chip" href="/admin/log?show=all&amp;from=2026-10-14&amp;to=2026-10-14">Yesterday</a><a class="chip" href="/admin/log" aria-current="true">Last 7 days</a><a class="chip" href="/admin/log?show=all&amp;from=2026-09-15&amp;to=2026-10-15">Last month</a></nav>');
		expect(page).toContain("1 to 3 of 3 lines, Fri 9 Oct 2026 to Thu 15 Oct 2026");
		// Which lines keeps the days, and the days keep which lines.
		const signIns = await (await makeClient(deps)("/admin/log?show=signins&from=2026-10-14&to=2026-10-14")).text();
		expect(signIns).toContain('<a class="chip" href="/admin/log?show=teams&amp;from=2026-10-14&amp;to=2026-10-14">Teams <span class="n">0</span></a>');
		expect(signIns).toContain('<a class="chip" href="/admin/log?show=signins&amp;from=2026-10-14&amp;to=2026-10-14" aria-current="true">Yesterday</a>');
	});

	it("shows any dates typed in, either way round, with a form that keeps which lines", async () => {
		const deps = await seeded();
		expect(await who(deps, "?show=all&from=2026-09-01&to=2026-09-30")).toEqual(["september@x.com"]);
		expect(await who(deps, "?show=all&from=2026-10-09&to=2026-10-08")).toEqual(["week@x.com", "month@x.com"]);
		// Not a real date: the last 7 days.
		expect(await who(deps, "?show=all&from=2026-02-30&to=2026-10-15")).toEqual(["today@x.com", "yesterday@x.com", "week@x.com"]);
		const page = await (await makeClient(deps)("/admin/log?show=signins&from=2026-09-01&to=2026-09-30")).text();
		expect(page).toContain('<form method="get" action="/admin/log" class="panel logfilters" data-autosubmit><input type="hidden" name="show" value="signins">');
		expect(page).toContain('<input type="date" name="from" value="2026-09-01" max="2026-10-15" required>');
		expect(page).toContain('<input type="date" name="to" value="2026-09-30" max="2026-10-15" required>');
		expect(page).not.toMatch(/aria-label="Which days">.*aria-current/);
		expect(page).toContain("1 to 1 of 1 line, Tue 1 Sep 2026 to Wed 30 Sep 2026");
	});

	it("shows the newest 5,000 lines of the dates asked for at most, and says so", async () => {
		const deps = createTestDeps();
		await deps.db.prepare(`WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 5000)
			INSERT INTO sign_in_events (kind, email, ip, at) SELECT 'code_sent', 'p' || i || '@x.com', '', '2026-10-14T00:00:00.000Z' FROM n`).run();
		const page = await (await makeClient(deps)("/admin/log")).text();
		expect(page).toContain("1 to 100 of 5,000 lines");
		expect(page).toContain("The newest 5,000 of each kind of line in these dates: choose fewer days for the rest.");
	});
});

describe("the admin Log's table and filters", () => {
	// Today, 15 Oct in the club's time zone: two people at the sign-in page, a team manager's change, and device views.
	const busy = async () => {
		const deps = createTestDeps();
		const at = (h: number) => new Date(Date.parse("2026-10-14T13:00:00.000Z") + h * 60_000).toISOString();
		await recordSignInEvent(deps.db, { kind: "code_sent", email: "mum@x.com", ip: "1.2.3.4", at: at(1) });
		await recordSignInEvent(deps.db, { kind: "wrong", email: "mum@x.com", ip: "1.2.3.4", at: at(2) });
		await recordSignInEvent(deps.db, { kind: "signed_in", email: "mum@x.com", ip: "1.2.3.4", at: at(3) });
		await recordSignInEvent(deps.db, { kind: "mobile_view", email: "mum@x.com", ip: "1.2.3.4", at: at(4) });
		await recordSignInEvent(deps.db, { kind: "robot", email: "bot@x.com", ip: "9.9.9.9", at: at(5) });
		await makeClient(deps)("/members", form({ email: "dad@x.com", name: "Dad", role: "watcher" }));
		return deps;
	};

	it("is a table a day at a time: when, who, the event, what happened, the team and the device (with the address)", async () => {
		const page = await (await makeClient(await busy())("/admin/log")).text();
		expect(page).toContain("<th scope=\"col\">Time</th><th scope=\"col\">Who</th><th scope=\"col\">Event</th><th scope=\"col\">What happened</th><th scope=\"col\">Team</th><th scope=\"col\">Device</th>");
		expect(page).toContain('<tr class="sectionrow lday"><td colspan="6">Thu 15 Oct 2026</td></tr>');
		expect(page).toContain('<a class="ev warn" href="/admin/log?show=all&amp;from=2026-10-09&amp;to=2026-10-15&amp;event=robot" title="Only Robot check said no">Robot check said no</a>');
		expect(page).toContain('<a class="ev good" href="/admin/log?show=all&amp;from=2026-10-09&amp;to=2026-10-15&amp;event=signed_in"');
		// A person, a team and an address each filter to their own lines.
		expect(page).toContain('<td class="l-who"><a href="/admin/log?show=all&amp;from=2026-10-09&amp;to=2026-10-15&amp;who=mum%40x.com" title="Only mum@x.com">mum@x.com</a></td>');
		expect(page).toContain('<a class="teamtag" href="/admin/log?show=all&amp;from=2026-10-09&amp;to=2026-10-15&amp;team=b12.1-2026" title="Only Saints B12.1 (2026/27)">Saints B12.1</a>');
		expect(page).toContain('<a class="l-addr" href="/admin/log?show=all&amp;from=2026-10-09&amp;to=2026-10-15&amp;q=9.9.9.9" title="Only 9.9.9.9">9.9.9.9</a>');
		// The figures for the lines shown: the warnings are the wrong code and the robot.
		expect(page).toMatch(/<div class="lstat"><b>6<\/b><span>lines<\/span><\/div><div class="lstat"><b>3<\/b><span>people<\/span><\/div>\s*<div class="lstat"><b>1<\/b><span>signed in<\/span><\/div><div class="lstat warn"><b>2<\/b><span>warnings<\/span><\/div>/);
	});

	it("filters by who, team, event and words, together, and each filter offers what the others leave, with how many", async () => {
		const deps = await busy();
		expect(await who(deps, "?who=MUM@x.com&from=2026-10-09&to=2026-10-15")).toEqual(["mum@x.com", "mum@x.com", "mum@x.com", "mum@x.com"]);
		expect(await lines(deps, "?who=mum@x.com&event=wrong&from=2026-10-09&to=2026-10-15")).toEqual(["mum@x.com typed a wrong code from 1.2.3.4"]);
		expect(await who(deps, "?team=b12.1-2026&from=2026-10-09&to=2026-10-15")).toEqual([MANAGER]);
		expect(await who(deps, "?q=9.9.9&from=2026-10-09&to=2026-10-15")).toEqual(["bot@x.com"]);
		expect(await who(deps, "?q=DAD&from=2026-10-09&to=2026-10-15")).toEqual([MANAGER]);
		const page = await (await makeClient(deps)("/admin/log?who=mum@x.com&from=2026-10-09&to=2026-10-15")).text();
		// Who still offers everyone (its own filter aside); Event offers only mum's, grouped by where they come from.
		expect(page).toContain('<option value="bot@x.com">bot@x.com (1)</option>');
		expect(page).toContain('<option value="mum@x.com" selected>mum@x.com (4)</option>');
		expect(page).toContain('<optgroup label="Sign-in page"><option value="code_sent">Code sent (1)</option><option value="mobile_view">Mobile view (1)</option><option value="signed_in">Signed in (1)</option><option value="wrong">Wrong code (1)</option></optgroup>');
		expect(page).not.toContain('<option value="robot">');
		expect(page).toContain('Sign-ins <span class="n">4</span>');
		expect(page).toContain(">Clear filters</a>");
	});

	it("hides device views when asked, unless that's the event chosen", async () => {
		const deps = await busy();
		const q = "&from=2026-10-09&to=2026-10-15";
		expect((await lines(deps, `?quiet=1${q}`)).some((l) => l.includes("mobile view"))).toBe(false);
		expect(await lines(deps, `?quiet=1&event=mobile_view${q}`)).toEqual(["mum@x.com is using the mobile view from 1.2.3.4"]);
	});

	it("ignores filters it doesn't know, and keeps a chosen person with no lines on these days as a choice", async () => {
		const deps = await busy();
		expect(await lines(deps, "?event=nonsense&show=nonsense&page=-3")).toHaveLength(6);
		const page = await (await makeClient(deps)("/admin/log?who=gone@x.com")).text();
		expect(page).toContain('<option value="gone@x.com" selected>gone@x.com (0)</option>');
		expect(page).toContain("<b>No lines match.</b>");
	});

	it("shows 100 lines a page, newest first, with Newer and Older", async () => {
		const deps = createTestDeps();
		await deps.db.prepare(`WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 249)
			INSERT INTO sign_in_events (kind, email, ip, at) SELECT 'code_sent', 'p' || i || '@x.com', '', strftime('%Y-%m-%dT%H:%M:%fZ', '2026-10-14T00:00:00.000Z', '+' || i || ' seconds') FROM n`).run();
		expect((await who(deps))[0]).toBe("p249@x.com");
		const two = await (await makeClient(deps)("/admin/log?show=all&from=2026-10-09&to=2026-10-15&page=2")).text();
		expect(two).toContain("101 to 200 of 250 lines");
		expect(two).toContain('<a class="btn" href="/admin/log">Newer</a><span class="small">Page 2 of 3</span><a class="btn" href="/admin/log?show=all&amp;from=2026-10-09&amp;to=2026-10-15&amp;page=3">Older</a>');
		expect((await who(deps, "?show=all&from=2026-10-09&to=2026-10-15&page=3"))).toHaveLength(50);
		// Past the last page: the last page.
		expect(await (await makeClient(deps)("/admin/log?page=9")).text()).toContain("201 to 250 of 250 lines");
	});

	it("downloads the lines the filters show for Excel, every page of them", async () => {
		const deps = await busy();
		const page = await (await makeClient(deps)("/admin/log?who=mum@x.com")).text();
		expect(page).toContain('<a class="btn" href="/admin/log.xlsx?show=all&amp;from=2026-10-09&amp;to=2026-10-15&amp;who=mum%40x.com" download>Download for Excel</a>');
		const res = await makeClient(deps)("/admin/log.xlsx?show=all&from=2026-10-09&to=2026-10-15&who=mum%40x.com");
		expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="site-log-2026-10-09-to-2026-10-15.xlsx"');
		const rows = sheetRows(new Uint8Array(await res.arrayBuffer()));
		expect(rows[0]).toEqual(["Courtside log, Fri 9 Oct 2026 to Thu 15 Oct 2026"]);
		expect(rows[1]![0]).toContain("4 lines, newest first, in local time. Filtered to who: mum@x.com.");
		expect(rows[4]).toEqual(["When", "Who", "Event", "What happened", "Team", "Device", "From", "Kind"]);
		expect(rows[5]).toEqual(["Thu 15 Oct 2026, 12:04am", "mum@x.com", "Mobile view", "is using the mobile view", "", "", "1.2.3.4", "Sign-in page"]);
		expect(rows).toHaveLength(9);
	});
});

describe("the admin Log's devices", () => {
	const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1";
	const devices = async (deps: TestDeps) => {
		const page = await (await makeClient(deps)("/admin/log")).text();
		return [...page.matchAll(/<td class="l-what">([^]*?)<\/td>[^]*?<td class="l-ip">(?:<a href[^>]*>([^<]*)<\/a>)?/g)].map((m) => `${m[1]} [${m[2] ?? ""}]`.replaceAll("&#39;", "'"));
	};
	it("says which device each person's line came from, from the browser that sent it", async () => {
		const deps = createTestDeps();
		await makeClient(deps)("/members", { ...form({ email: "mum@x.com", name: "", role: "watcher" }), headers: { "User-Agent": IPHONE } });
		// Not a browser (Stream's webhooks, a script): no device.
		await makeClient(deps)("/members", { ...form({ email: "dad@x.com", name: "", role: "watcher" }), headers: { "User-Agent": "curl/8.0" } });
		expect(await devices(deps)).toEqual(["added dad@x.com as watch only to Saints B12.1 []", "added mum@x.com as watch only to Saints B12.1 [iPhone, Safari]"]);
	});
	it("a sign-in's events say the device that asked", async () => {
		const deps = createTestDeps();
		await recordSignInEvent(deps.db, { kind: "signed_in", email: "mum@x.com", ip: "", at: deps.now().toISOString(), device: "Android, Chrome" });
		expect(await devices(deps)).toEqual(["signed in [Android, Chrome]"]);
	});
});

