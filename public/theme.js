// Light/dark switch. Runs in <head> (not deferred) so a saved choice applies before the page paints.
// No choice saved = dark, whatever the phone or computer's own setting. The choice is per device (localStorage).
const KEY = "courtside-theme";
const root = document.documentElement;
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode: still switches for this page */ } };
root.dataset.theme = read() === "light" ? "light" : "dark";

const isDark = () => root.dataset.theme === "dark";
const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>';

document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("theme-toggle");
	if (!button) return;
	// A round button right of Help: the sun switches to light, the moon to dark.
	const show = () => {
		const label = isDark() ? "Switch to light mode" : "Switch to dark mode";
		button.innerHTML = isDark() ? SUN : MOON;
		button.setAttribute("aria-label", label);
		button.title = label;
	};
	button.hidden = false;
	show();
	button.addEventListener("click", () => {
		root.dataset.theme = isDark() ? "light" : "dark";
		save(root.dataset.theme);
		show();
	});
});
