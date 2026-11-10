// Anyone's view on a computer: the desktop view (desktop.css: a sidebar, on a wide screen with a
// mouse) or the phone's view, as they choose. Runs in <head> (not deferred) so a saved choice applies before the
// page paints; the choice is per device (localStorage). The two buttons (ui/layout.ts) show only on a desktop screen
// (desktop.css): Switch to mobile view in the desktop view, Switch to desktop view in the mobile one. A plain script in
// the head beside theme.js, so it keeps its names to itself (the two share one scope). The site is told which view
// the device uses, in a cookie (auth/session-view.ts: the admin Log, and Insights' tally): the desktop view on a wide
// screen with a mouse (desktop.css's media query) unless the mobile view is chosen.
(() => {
	const KEY = "courtside-view";
	const DESKTOP = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
	const root = document.documentElement;
	const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
	const save = (v) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* private mode: still switches for this page */ } };
	const tell = () => {
		const view = root.dataset.view !== "mobile" && matchMedia(DESKTOP).matches ? "desktop" : "mobile";
		document.cookie = `courtside_view=${view}; Path=/; Secure; SameSite=Lax; Max-Age=2592000`;
	};
	if (read() === "mobile") root.dataset.view = "mobile";
	tell();

	document.addEventListener("DOMContentLoaded", () => {
		for (const button of document.querySelectorAll("[data-view-to]")) {
			button.addEventListener("click", () => {
				const mobile = button.dataset.viewTo === "mobile";
				if (mobile) root.dataset.view = "mobile";
				else delete root.dataset.view;
				save(mobile ? "mobile" : null);
				tell();
				window.scrollTo(0, 0);
			});
		}
	});
})();
