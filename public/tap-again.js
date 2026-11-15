// A button whose job has no undo (Cancel upload): the first tap asks, by renaming the button, and a second within 8
// seconds does it. Left alone, it goes back to its own name.

/** `sure()` on each tap: true on the tap that means it. `reset()` when its job is over, so no earlier wait lingers. */
export function tapAgain(button, ask, ms = 8000) {
	const label = button.textContent;
	let wait = null;
	const reset = () => {
		clearTimeout(wait);
		wait = null;
		button.textContent = label;
	};
	return {
		sure() {
			if (wait !== null) { reset(); return true; }
			button.textContent = ask;
			wait = setTimeout(reset, ms);
			return false;
		},
		reset,
	};
}
