import { html, type SafeHtml } from "../shared/html.ts";

/**
 * A delete that asks first (every delete and remove), the way End game does: Delete opens the
 * question and what it means, with Yes, delete it and Keep it (public/confirm.js closes it, and stops a second tap).
 * The form sends confirm=yes, which every delete route requires (`{ confirm: true }`), so one tap deletes nothing.
 */
export function confirmButton(o: { action: string; label: string; question: string; consequence: string; yes?: string; keep?: string; summaryClass?: string; fields?: Record<string, string> }): SafeHtml {
	const fields = Object.entries(o.fields ?? {}).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}">`);
	const panel = html`<p><b>${o.question}</b> ${o.consequence}</p><input type="hidden" name="confirm" value="yes">${fields}`;
	const buttons = html`<button class="btn danger">${o.yes ?? "Yes, delete it"}</button> <button type="button" class="btn" data-keep>${o.keep ?? "Keep it"}</button>`;
	return html`<details class="confirm"><summary class="${o.summaryClass ?? "btn quiet"}">${o.label}</summary><form method="post" action="${o.action}" class="confirmpanel">${panel}${buttons}</form></details>`;
}
