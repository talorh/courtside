// What an admin sees at the top of a team's pages: that they're in it as its team manager through their
// admin's way in, with the way back; or that they're viewing it as another role, with Stop. An admin who's a real
// member of the team sees nothing until choosing View as.
import { ROLE_LABELS } from "../auth/permissions.ts";
import { teamLabel } from "../features/teams/team-code.ts";
import { html, type SafeHtml } from "../shared/html.ts";
import type { PageFrame } from "./layout.ts";

export function adminStrip(frame: PageFrame): SafeHtml | "" {
	const label = teamLabel(frame.team);
	if (frame.viewAs) {
		return html`<div class="adminstrip" role="status">Viewing ${label} as ${ROLE_LABELS[frame.viewAs]}. <form method="post" action="/view-as/stop" class="inline"><input type="hidden" name="next" value="/"><button class="btn quiet">Stop</button></form></div>`;
	}
	if (frame.member.hidden) return html`<div class="adminstrip" role="status">${`Admin: you're seeing ${label} as its team manager.`} <a href="/admin">Back to Admin</a></div>`;
	return "";
}
