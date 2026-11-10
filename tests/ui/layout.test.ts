import { describe, expect, it } from "vitest";
import type { Member } from "../../src/features/members/members-repository.ts";
import { html } from "../../src/shared/html.ts";
import { layout, type PageFrame } from "../../src/ui/layout.ts";
import { B12_1 } from "../helpers/fakes.ts";
import { G14_5 } from "../helpers/two-teams.ts";

const member = (role: Member["role"]): PageFrame => ({
	team: B12_1, viewer: { email: "a@b.c", isAdmin: false, memberships: [] }, viewAs: null,
	member: { id: 1, teamId: B12_1.id, email: "a@b.c", name: "A", role, lastSeenAt: null, hideScores: false, hidden: false },
});

describe("layout", () => {
	it("shows nav items by role", () => {
		const watcher = layout({ title: "Games", frame: member("watcher"), current: "games" }, html`x`).__html;
		expect(watcher).toContain('href="/games" class="big watch"');
		expect(watcher).toContain("Watch games");
		expect(watcher).not.toContain('href="/upload"');
		const admin = layout({ title: "Games", frame: member("manager") }, html`x`).__html;
		expect(admin).toContain('href="/manage"');
	});
	it("Photos takes Help's grey button: Roster, Fixture, Photos", () => {
		const out = layout({ title: "Photos", frame: member("watcher"), current: "photos" }, html`x`).__html;
		const grey = /<div class="navgrey">(.*?)<\/div>/.exec(out)![1]!;
		expect([...grey.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/roster", "/fixture", "/photos"]);
		expect(grey).toContain('<a href="/photos" class="big grey" aria-current="page"><svg');
		expect(grey).not.toContain("/help");
	});
	it("Help is an oval button that says Help, then light/dark and the sign-out door; no reload button", () => {
		const out = layout({ title: "Help", frame: member("watcher"), current: "help" }, html`x`).__html;
		expect(out).toMatch(/<\/span><\/a>\n<a class="helpbtn" href="\/help" aria-label="Help, and Ask Virtual Sam" aria-current="page"><svg[^]*?<\/svg>Help<\/a>\n<button class="themebtn"[^>]*><\/button>\n<a class="signoutbtn" /);
		expect(out).not.toContain("reloadbtn");
		expect(out).not.toContain("askicon");
		expect(layout({ title: "Games", frame: member("watcher") }, html`x`).__html).toMatch(/<a class="helpbtn" href="\/help" aria-label="Help, and Ask Virtual Sam"><svg[^]*?<\/svg>Help<\/a>/);
	});
	it("can be added to a Home Screen as Courtside (not the page's title)", () => {
		const out = layout({ title: "Games", frame: member("watcher"), scripts: ["/watch.js"] }, html`x`).__html;
		// Every file is behind the sign-in, so the manifest needs the site's cookies to load.
		expect(out).toContain('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials">');
		expect(out).toContain('<meta name="apple-mobile-web-app-title" content="Courtside">');
		expect(out).toContain('<script type="module" src="/webapp.js"></script><script type="module" src="/pull-refresh.js"></script><script type="module" src="/signout.js"></script><script type="module" src="/confirm.js"></script><script type="module" src="/watch.js"></script>');
		// Signed-out pages still hold back the browser's install banner.
		expect(layout({ title: "Not on the list", frame: null }, html`x`).__html).toContain('<script type="module" src="/webapp.js"></script>');
	});
	it("has a sign-out door furthest right of the top bar, which still works without JavaScript (a plain Sign out page)", () => {
		const out = layout({ title: "Games", frame: member("watcher") }, html`x`).__html;
		expect(out).toMatch(/<button class="themebtn"[^>]*><\/button>\n<a class="signoutbtn" href="\/signout" data-signout aria-label="Sign out" title="Sign out"><svg/);
	});
	it("gives every team page the desktop view's stylesheet, body class and view switch (every role, consistent)", () => {
		// The view itself is CSS alone (public/desktop.css): a sidebar only on a wide screen with a mouse. The HTML is the same.
		for (const role of ["manager", "watcher", "filmer", "coach"] as const) {
			const out = layout({ title: "Games", frame: member(role), current: "games" }, html`x`).__html;
			expect(out, role).toContain('<link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/desktop.css">');
			expect(out, role).toContain('<body class="desk">');
			// Their choice of view on a computer (public/view.js, in the head like theme.js), and the two buttons that make it.
			expect(out, role).toContain('<script src="/theme.js"></script><script src="/view.js"></script>');
			expect(out, role).toContain('<button class="viewswitch" type="button" data-view-to="desktop">Switch to desktop view</button></div></nav>\n<button class="viewswitch" type="button" data-view-to="mobile">Switch to mobile view</button></div></header>');
		}
		const manager = layout({ title: "Games", frame: member("manager"), current: "games" }, html`x`).__html;
		// The pages that are no team's (the sign-in, errors, the admin area) have neither.
		const entry = layout({ title: "x", frame: null, bodyClass: "entry" }, html`x`).__html;
		expect(entry).not.toContain("/desktop.css");
		expect(entry).not.toContain("/view.js");
		// The sidebar's links: Manage team and Notifications carry icons now (shown in the desktop view only), and the
		// entry pages and the admin area keep their own classes.
		expect(manager).toMatch(/<a href="\/manage" class=""><svg[^]*?<\/svg>Manage team<\/a><a href="\/notifications" class=""><svg[^]*?<\/svg>Notifications<\/a>/);
		expect(layout({ title: "x", frame: null, bodyClass: "entry" }, html`x`).__html).toContain('<body class="entry">');
	});
	it("escapes the title and marks the current page", () => {
		const out = layout({ title: "<x>", frame: member("watcher"), current: "games" }, html``).__html;
		expect(out).toContain("<title>&lt;x&gt; · Saints B12.1</title>");
		expect(out).toContain('aria-current="page"');
	});
	it("names the page's team, and puts the team on every post form and nowhere else", () => {
		const page = { ...member("watcher"), team: G14_5 };
		const out = layout({ title: "Photos", frame: page }, html`<form method="post" action="/a"><button>A</button></form><form method="get" action="/b"></form><form class="x" method="post">`).__html;
		expect(out).toContain('<html lang="en-AU" data-site="Courtside" data-team="g14.5-2026" data-team-name="Saints G14.5" data-ask="">');
		expect(out).toContain("<title>Photos · Saints G14.5</title>");
		expect(out).toContain('<form method="post" action="/a"><input type="hidden" name="_team" value="g14.5-2026"><button>A</button></form><form method="get" action="/b"></form><form class="x" method="post"><input type="hidden" name="_team" value="g14.5-2026">');
		expect(out.match(/name="_team"/g)).toHaveLength(2);
		const none = layout({ title: "Which team?", frame: null }, html`<form method="post" action="/teams/switch"></form>`).__html;
		expect(none).toContain('<html lang="en-AU"><head>');
		expect(none).toContain("<title>Which team? · Courtside</title>");
		expect(none).not.toContain("_team");
	});
});
