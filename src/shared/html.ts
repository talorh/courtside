/** Markup that is already safe to emit. Only `html` and `raw` create it. */
export interface SafeHtml {
	readonly __html: string;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Trusted markup only (constants written in this codebase). Never pass user input. */
export function raw(markup: string): SafeHtml {
	return { __html: markup };
}

function render(value: unknown): string {
	if (value === null || value === undefined || value === false) return "";
	if (Array.isArray(value)) return value.map(render).join("");
	if (typeof value === "object" && "__html" in value) return (value as SafeHtml).__html;
	return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
	let out = strings[0] ?? "";
	values.forEach((value, i) => {
		out += render(value) + (strings[i + 1] ?? "");
	});
	return raw(out);
}
