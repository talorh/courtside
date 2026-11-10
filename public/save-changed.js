// Manage team's People: a person's Save shows only once their name or role differs from what's saved, and goes again if
// it's put back. It keeps its place while hidden, so the row doesn't shift. Without this script every Save shows.
for (const save of document.querySelectorAll("[data-save]")) {
	const fields = [...save.form.elements].filter((field) => field !== save);
	const changed = (field) => (field.tagName === "SELECT"
		? [...field.options].some((option) => option.selected !== option.defaultSelected)
		: field.value !== field.defaultValue);
	const show = () => save.toggleAttribute("data-same", !fields.some(changed));
	for (const field of fields) for (const type of ["input", "change"]) field.addEventListener(type, show);
	// Back to this page from the browser's cache, the boxes may still hold what was typed.
	window.addEventListener("pageshow", show);
	show();
}
