// Roster: the week-by-week chart covers the whole season, so a narrow screen slides sideways through it. It opens a few
// weeks before this week rather than at October.
const scroller = document.querySelector(".fm-scroller[data-now-x]");
if (scroller) scroller.scrollLeft = Math.max(0, Number(scroller.dataset.nowX) - 3 * 14);

// A link to a week (#w2026-11-23: after Save week, or Back to the roster from the match day message) can point inside
// Later or Earlier weeks, which start folded: open the fold and show the week.
const week = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
const fold = week?.closest("details:not([open])");
if (fold) {
	fold.open = true;
	week.scrollIntoView();
}
