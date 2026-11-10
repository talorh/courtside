import { describe, expect, it } from "vitest";
import { html, raw } from "../../src/shared/html.ts";

describe("html", () => {
	it("escapes interpolated values", () => {
		expect(html`<p>${'<b>"Tom" & Jo\'s</b>'}</p>`.__html).toBe("<p>&lt;b&gt;&quot;Tom&quot; &amp; Jo&#39;s&lt;/b&gt;</p>");
	});
	it("nests safe html, joins arrays and drops null/false", () => {
		const items = ["a", "b"].map((x) => html`<li>${x}</li>`);
		expect(html`<ul>${items}${null}${false}${raw("<hr>")}</ul>`.__html).toBe("<ul><li>a</li><li>b</li><hr></ul>");
	});
	it("renders numbers", () => {
		expect(html`${0} ${42}`.__html).toBe("0 42");
	});
});
