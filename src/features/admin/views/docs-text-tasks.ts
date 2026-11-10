// The Documentation page's common admin tasks: what an admin does, where, and what the site then does.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";

export const tasks = (): DocSection => ({ id: "tasks", title: "Common admin tasks", body: html`
<p>Most of an admin's work is done from Insights, Teams and Support. Everything here is in the admin area; nothing needs the
command line except the maintenance page.</p>
${table(["Task", "Where and how", "What the site does"], [
		["Onboard a team", "Teams, Onboard a team: the team's code (B12.1), its season (this or next), the team manager's name and email, and who members are told to ask.", "Makes the team, emails the team manager a welcome (Reply-To you) and shows it to copy or send again. The team manager then adds people and players, the fixture and the roster: the setup checklist."],
		["Help a team manager", "Teams, Open: you're in the team as its team manager, with a strip saying so and Back to Admin.", "Everything a team manager can do, logged as you in the Log."],
		["See what a family sees", "Teams, More, View as Watch only (or Watch and film, coach, team manager).", "The team's pages as that role, with Stop in the strip. It isn't read-only: anything changed there is done, and logged, as you."],
		["Answer a ticket", "Support, Tickets: open it, reply, add a private note, set the status or owner.", "The reply is saved, then emailed to the team manager; their reply comes back to the ticket and emails you."],
		["Check the site is all right", "Insights, the top of it.", "All green, or each problem first, with every check as a light and what's going on now."],
		["A failed video", "The 5-minute job raises a ticket with Stream's reason. Open the team and delete the video, which frees the game.", "The person uploads again; a removed video's media goes a day later."],
		["Replace a video", "As the team manager: delete the game's video on its page, then it can be uploaded again.", "One video per game is the rule; a deleted one keeps its media for a day in case it was a mistake."],
		["A removal request", "The Log's Right now shows requests waiting in any team; the team manager handles it on Manage team.", "A video, clip or photo removed by the team manager leaves the site at once; its media goes a day later."],
		["Remove someone's access", "Open the team as its manager, Manage team, People: remove them.", "The teams' lists are checked on every request, so they're out straight away, on every device."],
		["End a season", "Teams, More, End season and close team.", "Read-only at once; deleted with its footage on 31 December of the year its season ends, or at 3am on a night you pick. Reopen works until deleting starts."],
		["Delete a team tonight", "Teams, More, Delete tonight: type the team's code.", "From 3am the 5-minute job deletes it, a slice a run: media first, then the rows. Only its download log stays, two years."],
		["Add or remove an admin", "Admins: add their email, or remove it.", "They sign in like everyone else; the admin area appears for them at once."],
		["Try the jobs on staging", "Platform on the staging site: Run the 5-minute job now.", "The same code against staging's test data; the 3am job never runs by itself there."],
		["Put up the maintenance page", html`From a computer with the code: ${code("npm run maintenance -- on")} (and ${code("-- off")}), with the owner's go-ahead.`, "Everyone but admins sees Back soon; admins see the real site to check it."],
	])}`});
