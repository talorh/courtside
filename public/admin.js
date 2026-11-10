// The admin area (admin.css): on a phone the sections are one row that scrolls sideways, so the one
// you're on is scrolled into view; a row's More menu closes when another opens or when you tap anywhere else; and a
// filter form (data-autosubmit: the Log's, Support's) applies as soon as a choice in it changes (a search applies on
// Enter, a date with Apply, as typing one changes it a digit at a time); and a row of Support's queue opens its ticket
// when clicked anywhere (its name is the link, for keyboards and screen readers).
const current = document.querySelector(".adminnav [aria-current]");
if (current && matchMedia("(max-width: 1023px)").matches) current.scrollIntoView({ block: "nearest", inline: "center" });

const menus = () => document.querySelectorAll("details.rowmenu[open]");
document.addEventListener("toggle", (event) => {
	const opened = event.target;
	if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.classList.contains("rowmenu")) return;
	for (const other of menus()) if (other !== opened) other.open = false;
}, true);
document.addEventListener("click", (event) => {
	for (const menu of menus()) if (!(event.target instanceof Node && menu.contains(event.target))) menu.open = false;
});
document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	for (const menu of menus()) {
		menu.open = false;
		menu.querySelector("summary")?.focus();
	}
});

document.addEventListener("change", (event) => {
	const field = event.target;
	if (!(field instanceof HTMLSelectElement || (field instanceof HTMLInputElement && field.type === "checkbox"))) return;
	const form = field.closest("form[data-autosubmit]");
	if (form instanceof HTMLFormElement) form.requestSubmit();
});

document.addEventListener("click", (event) => {
	if (!(event.target instanceof Element) || event.target.closest("a, button, input, select, label")) return;
	const row = event.target.closest("tr[data-href]");
	const href = row?.getAttribute("data-href");
	if (href?.startsWith("/admin/support/")) location.assign(href);
});
