// Go live: picking another game switches to it straight away (the "Use this game" button is only for no-JS).
const form = document.getElementById("game-form");
if (form) {
	form.querySelector("button")?.setAttribute("hidden", "");
	form.querySelector("select")?.addEventListener("change", () => form.submit());
}
