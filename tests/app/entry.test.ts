import { describe, expect, it } from "vitest";
import * as entry from "../../src/index.ts";

describe("the Worker's entry module", () => {
	// workerd takes every export of the entry as a handler and refuses to start on anything else ("Incorrect type for
	// map entry"): the local runtime does today, and the deployed one accepts it only for now.
	it("exports only the Worker itself", () => {
		expect(Object.keys(entry)).toEqual(["default"]);
	});
});
