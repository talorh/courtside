// "Are you sure" (src/ui/confirm.ts) on every page: Keep it closes the question; Yes posts once, however many taps.
for (const keep of document.querySelectorAll(".confirm [data-keep]")) {
	keep.addEventListener("click", () => { keep.closest("details").open = false; });
}
for (const form of document.querySelectorAll(".confirm form")) {
	form.addEventListener("submit", (e) => {
		if (form.dataset.sent) { e.preventDefault(); return; }
		form.dataset.sent = "1";
		// Greyed out once this tap's post has started, so the page shows it's on its way.
		setTimeout(() => { for (const button of form.querySelectorAll("button:not([data-keep])")) button.disabled = true; });
	});
}
// Back to this page from the browser's cache (as signin.js): the questions work again.
window.addEventListener("pageshow", (e) => {
	if (!e.persisted) return;
	for (const form of document.querySelectorAll(".confirm form")) {
		delete form.dataset.sent;
		for (const button of form.querySelectorAll("button")) button.disabled = false;
	}
});
