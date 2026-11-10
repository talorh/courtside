import type { Role } from "../../auth/permissions.ts";
import type { SafeHtml } from "../../shared/html.ts";
import type { HelpFor } from "./views/faq-item.ts";
import { helpSections } from "./views/help-page.ts";

// What Virtual Team Manager knows: the Help page the person asking sees (each role its own topics), as plain text, so the answers
// change whenever the page does. The mock screenshots and the install box (filled in on the phone) aren't words to
// answer from, so they're left out.

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

function plain(h: SafeHtml): string {
	return h.__html
		.replace(/<figure class="(?:mock|shot)[^"]*"[\s\S]*?<\/figure>/g, "").replace(/<div class="installbox"[\s\S]*?<\/div>/g, "")
		.replace(/<summary>/g, "\n\nQ: ").replace(/<\/summary>/g, "\nA:")
		.replace(/<h[23][^>]*>/g, "\n").replace(/<li>/g, "\n- ")
		.replace(/<img [^>]*>/g, "")
		.replace(/<[^>]+>/g, "")
		.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
		.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ")
		.trim();
}

export const helpText = (h: HelpFor, role: Role) => plain(helpSections(h, role));
