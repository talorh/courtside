// The sign-in page's script: Send a new code waits a minute (the first one is usually seconds away, and an address that
// asks for 10 in an hour waits), counting down on the button; a tap on either button posts once; the field being
// typed in is kept above a phone's keyboard; and the code field takes a code typed, pasted or filled in by the phone
// from the email (autocomplete="one-time-code") and logs in by itself at six digits. The forms that send a code carry
// Cloudflare's Turnstile widget (platform/turnstile.ts): its script is loaded here, and a form waits for its token.

export const WAIT_S = 60;
export const CODE_DIGITS = 6;
export const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
/** How long a form waits for Turnstile's token before it posts anyway (the site then says to try again). */
export const CHECK_WAIT_MS = 20_000;
const CHECK_POLL_MS = 200;

// The widget's script, a plain script of Cloudflare's (not a module), only where there's a widget. It finds the widgets
// itself and puts each token in its form, as cf-turnstile-response.
if (document.querySelector(".cf-turnstile")) {
	const script = document.createElement("script");
	script.src = TURNSTILE_SRC;
	script.async = true;
	document.head.append(script);
}

/** The form's Turnstile token, or "" while there isn't one yet; null for a form without the widget, or when the widget's
 * script never loaded (blocked, or offline): then the form just posts, and the site says what's wrong. */
export function checkToken(form) {
	if (!form.querySelector(".cf-turnstile") || !window.turnstile) return null;
	return form.querySelector('[name="cf-turnstile-response"]')?.value ?? "";
}

/** A tap before Turnstile's token is ready: the button waits (a second or so, or until a shown check is ticked), then
 * the form posts by itself. */
function postWhenChecked(form) {
	if (form.dataset.checking) return;
	form.dataset.checking = "1";
	const buttons = [...form.querySelectorAll("button")];
	for (const button of buttons) button.disabled = true;
	const started = Date.now();
	const poll = setInterval(() => {
		if (!checkToken(form) && Date.now() - started < CHECK_WAIT_MS) return;
		clearInterval(poll);
		delete form.dataset.checking;
		form.dataset.checked = "1";
		form.requestSubmit();
	}, CHECK_POLL_MS);
}

const resend = document.querySelector("[data-resend]");
if (resend) {
	let left = WAIT_S;
	const tick = () => {
		resend.disabled = left > 0;
		resend.textContent = left > 0 ? `Send a new code (ready in ${left}s)` : "Send a new code";
		if (left-- <= 0) clearInterval(timer);
	};
	const timer = setInterval(tick, 1000);
	tick();
}
const forms = document.querySelectorAll(".signin form");
for (const form of forms) {
	form.addEventListener("submit", (e) => {
		if (form.dataset.sent) { e.preventDefault(); return; }
		if (checkToken(form) === "" && !form.dataset.checked) { e.preventDefault(); postWhenChecked(form); return; }
		form.dataset.sent = "1";
		setTimeout(() => { for (const button of form.querySelectorAll("button")) button.disabled = true; });
	});
}
// Back to this page from the browser's cache (Back after Sign in): the forms work again.
window.addEventListener("pageshow", (e) => {
	if (!e.persisted) return;
	// A token is good once: the one from before is spent, so each widget makes a new one.
	if (window.turnstile) for (const widget of document.querySelectorAll(".cf-turnstile")) window.turnstile.reset(widget);
	for (const form of forms) {
		delete form.dataset.sent;
		delete form.dataset.checked;
		for (const button of form.querySelectorAll("button:not([data-resend])")) button.disabled = false;
	}
});

/** "482913", "482 913" or a pasted "Your code is 482 913" as the field shows it: six digits at most, a space after three. */
export function tidyCode(text) {
	const digits = text.replace(/\D/g, "").slice(0, CODE_DIGITS);
	return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

const code = document.querySelector("[data-code]");
if (code) {
	code.addEventListener("input", () => {
		const tidy = tidyCode(code.value);
		if (tidy !== code.value) code.value = tidy;
		// Six digits, however they got there: in it goes, no tap needed.
		if (tidy.replace(/\D/g, "").length === CODE_DIGITS && !code.form.dataset.sent) code.form.requestSubmit();
	});
}

// A phone's keyboard can cover the field being typed in: once it's up (the viewport shrinks), the field is brought
// back into view. The wait is for the keyboard's slide.
const keepInView = () => {
	const el = document.activeElement;
	if (el && el.matches && el.matches(".signin input")) el.scrollIntoView({ block: "center", behavior: "smooth" });
};
for (const input of document.querySelectorAll(".signin input")) input.addEventListener("focus", () => setTimeout(keepInView, 350));
window.visualViewport?.addEventListener("resize", keepInView);
