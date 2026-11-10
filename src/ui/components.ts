import { html, type SafeHtml } from "../shared/html.ts";

/** The page's title, with a small line above it (`eyebrow`) when there's something worth saying there. */
export function pageHead(eyebrow: string | null, title: string): SafeHtml {
	return html`<div class="pagehead">${eyebrow ? html`<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1></div>`;
}

/** Fixed, code-defined messages only (never echo user input through the URL). */
export function notice(message: string | null | undefined, tone: "info" | "warn" = "info"): SafeHtml | "" {
	return message ? html`<div class="note${tone === "warn" ? " warn" : ""}" role="status">${message}</div>` : "";
}

export function selectOptions(options: Array<{ value: string; label: string }>, selected?: string): SafeHtml[] {
	return options.map((o) => html`<option value="${o.value}"${o.value === selected ? html` selected` : ""}>${o.label}</option>`);
}

export function postButton(action: string, label: string, className = "btn"): SafeHtml {
	return html`<form method="post" action="${action}" class="inline"><button class="${className}" type="submit">${label}</button></form>`;
}

/** 16:9 tile with a video frame, or the club's logo when there's no frame. `extra` overlays it (e.g. a duration). */
export function thumb(url: string | null, extra: SafeHtml | "" = ""): SafeHtml {
	return url
		? html`<div class="thumb has-img"><img src="${url}" alt="" loading="lazy">${extra}</div>`
		: html`<div class="thumb fallback"><img src="/logo.png" alt="" loading="lazy">${extra}</div>`;
}
