// Go live's buttons: each runs its job with the button disabled, and says what went wrong in plain words.

// A request that never got through. The browser's own words for it mean nothing to a filmer: "Failed to fetch"
// (Chrome), "Load failed" (Safari), "NetworkError when attempting to fetch resource." (Firefox), or a timeout.
const lostSignal = (err) => err?.name === "TimeoutError" || (err instanceof TypeError && /fetch|network|load failed/i.test(err.message));

/** What went wrong, for the filmer: a lost signal says so and which button to tap again; anything else, its own words. */
export const plainError = (err, button) => lostSignal(err)
	? `Couldn't reach the site: the signal may be weak. Check you have signal, then tap ${button.textContent.trim()} again.`
	: err.message;

/** run(button, job, explain): `explain(err)` turns a failure into words for the filmer (by default, `plainError`). */
export const buttonRunner = (say) => async function run(button, job, explain = (err) => plainError(err, button)) {
	button.disabled = true;
	try {
		await job();
	} catch (err) {
		console.error(err);
		say(explain(err));
	} finally {
		button.disabled = false;
	}
};
