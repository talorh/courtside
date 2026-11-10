// The setup checklist at the top of Manage team: how far the team manager has got (team-setup.ts), each step ticked or
// with where to do it. Gone once every step's done.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { ICON_CHECK } from "../../../ui/icons.ts";
import type { SetupStep } from "../team-setup.ts";

export function setupCard(steps: SetupStep[]): SafeHtml | "" {
	const left = steps.filter((s) => !s.done);
	if (!left.length) return "";
	const step = (s: SetupStep) => s.done ? html`<li class="done">${ICON_CHECK}<span>${s.label}</span></li>`
		: html`<li><span class="todo" aria-hidden="true"></span><span><a href="${s.href}">${s.label}</a> <span class="small">${s.how}</span></span></li>`;
	return html`<section class="panel stack setup" aria-labelledby="setup-h"><h2 id="setup-h">Getting the team ready: ${steps.length - left.length} of ${steps.length} done</h2>
<ul class="setuplist">${steps.map(step)}</ul><p class="small">This goes once every step's done.</p></section>`;
}
