// A form whose rows are added one at a time: Add families on the Roster (one surname a row). + Add another adds a row
// and puts the cursor in it; each extra row gets a × to take it off. Rows left blank are dropped before the form goes,
// so they can't get in the way; the site checks every row again when it arrives.
for (const form of document.querySelectorAll("form[data-rows]")) {
	const rows = form.querySelector(".addrows");
	const blank = rows.firstElementChild.cloneNode(true);
	const more = form.querySelector("[data-add-row]");
	const first = (row) => row.querySelector("input");
	const isBlank = (row) => [...row.querySelectorAll("input")].every((input) => !input.value.trim());
	// The × shows once there's more than one row: the first row is always there to type into.
	const tidy = () => {
		const all = rows.children;
		for (const row of all) row.querySelector("[data-remove-row]").hidden = all.length < 2;
	};
	const wire = (row) => {
		row.querySelector("[data-remove-row]").addEventListener("click", () => {
			row.remove();
			tidy();
		});
	};
	const addRow = () => {
		const row = blank.cloneNode(true);
		for (const input of row.querySelectorAll("input")) input.value = "";
		const select = row.querySelector("select");
		if (select) select.selectedIndex = blank.querySelector("select").selectedIndex;
		rows.append(row);
		wire(row);
		tidy();
		first(row).focus();
	};
	wire(rows.firstElementChild);
	more.hidden = false;
	more.addEventListener("click", addRow);
	form.addEventListener("submit", (e) => {
		for (const row of [...rows.children]) if (rows.children.length > 1 && isBlank(row)) row.remove();
		tidy();
		if (form.dataset.sent) { e.preventDefault(); return; }
		form.dataset.sent = "1";
		setTimeout(() => { for (const button of form.querySelectorAll("button")) button.disabled = true; });
	});
	// Back to this page from the browser's cache (as signin.js): the form works again.
	window.addEventListener("pageshow", (e) => {
		if (!e.persisted) return;
		delete form.dataset.sent;
		for (const button of form.querySelectorAll("button")) button.disabled = false;
		tidy();
	});
}
