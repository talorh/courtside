// "Are you sure" (src/ui/confirm.ts) on every page: Keep it closes the question; Yes posts once, however many taps.
// A form marked data-once (Send, a reply, Add a person) posts once the same way. Heard on the document, so a question
// put on the page later (a photo swiped to, photo-swipe.js) works the same.
const ONCE = ".confirm form, form[data-once]";
document.addEventListener("click", (e) => {
	const keep = e.target?.closest?.(".confirm [data-keep]");
	if (keep) keep.closest("details").open = false;
});
document.addEventListener("submit", (e) => {
	const form = e.target?.closest?.(ONCE);
	if (!form) return;
	if (form.dataset.sent) { e.preventDefault(); return; }
	form.dataset.sent = "1";
	// Greyed out once this tap's post has started, so the page shows it's on its way.
	setTimeout(() => { for (const button of form.querySelectorAll("button:not([data-keep])")) button.disabled = true; });
});
// Back to this page from the browser's cache (as signin.js): the questions and forms work again.
window.addEventListener("pageshow", (e) => {
	if (!e.persisted) return;
	for (const form of document.querySelectorAll(ONCE)) {
		delete form.dataset.sent;
		for (const button of form.querySelectorAll("button")) button.disabled = false;
	}
});
