import { afterEach, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;
const real = { document: g.document, location: g.location };
afterEach(() => { Object.assign(globalThis, real); });

it("the spinner opens the page it names in its own place, so Back never comes back to it", async () => {
	const replaced: string[] = [];
	Object.assign(globalThis, { document: { documentElement: { dataset: { to: "/" } } }, location: { replace: (to: string) => replaced.push(to) } });
	// @ts-expect-error: a browser script (plain JS), run here with a stand-in page.
	await import("../../public/landing.js");
	expect(replaced).toEqual(["/"]);
});
