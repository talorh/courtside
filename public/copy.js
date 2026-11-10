// Copy buttons: <button data-copy="id"> copies that field's text. If the browser won't, the text is selected to copy by hand.
for (const button of document.querySelectorAll("[data-copy]")) {
	button.addEventListener("click", async () => {
		const field = document.getElementById(button.dataset.copy);
		if (!field) return;
		const label = button.textContent;
		try {
			await navigator.clipboard.writeText(field.value ?? field.textContent);
			button.textContent = "Copied";
		} catch (err) {
			console.warn(`copy: ${err}`);
			field.select?.();
			button.textContent = "Selected: copy it now";
		}
		setTimeout(() => { button.textContent = label; }, 2500);
	});
}
