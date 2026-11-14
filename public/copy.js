// Copy buttons: <button data-copy="id"> copies that field's text. If the browser won't, the text is selected to copy by hand.
for (const button of document.querySelectorAll("[data-copy]")) {
	// Its own name, read once: a second tap while it says Copied mustn't keep Copied as its name.
	const label = button.textContent;
	let back;
	button.addEventListener("click", async () => {
		const field = document.getElementById(button.dataset.copy);
		if (!field) return;
		try {
			await navigator.clipboard.writeText(field.value ?? field.textContent);
			button.textContent = "Copied";
		} catch (err) {
			console.warn(`copy: ${err}`);
			field.select?.();
			button.textContent = "Selected: copy it now";
		}
		clearTimeout(back);
		back = setTimeout(() => { button.textContent = label; }, 2500);
	});
}
