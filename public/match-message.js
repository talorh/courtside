// The match day message (roster/views/message-page.ts): the team manager can change it in the box before it goes. Copy
// (copy.js) copies the box as it stands; Open WhatsApp is kept in step with it here, and hidden while the message is too
// long for a link, as the page itself does.
export const MAX_LINK = 2000;

/** The WhatsApp link that opens with `text` to send, or null when it's too long for a phone to take. */
export function waLink(text) {
	const link = `https://wa.me/?text=${encodeURIComponent(text)}`;
	return link.length <= MAX_LINK ? link : null;
}

const doc = globalThis.document;
const box = doc?.getElementById("match-message");
const open = doc?.querySelector("[data-wa]");
if (box && open) {
	const fits = doc.querySelector("[data-wa-fits]"), long = doc.querySelector("[data-wa-long]");
	box.addEventListener("input", () => {
		const link = waLink(box.value);
		if (link) open.href = link;
		open.hidden = !link;
		if (fits) fits.hidden = !link;
		if (long) long.hidden = Boolean(link);
	});
}
