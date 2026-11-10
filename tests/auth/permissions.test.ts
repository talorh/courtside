import { describe, expect, it } from "vitest";
import { hasRole, isRole } from "../../src/auth/permissions.ts";

describe("permissions", () => {
	it("ranks coach between filmer and admin", () => {
		expect(hasRole("coach", "filmer")).toBe(true);
		expect(hasRole("coach", "coach")).toBe(true);
		expect(hasRole("coach", "manager")).toBe(false);
		expect(hasRole("manager", "coach")).toBe(true);
		expect(isRole("coach")).toBe(true);
	});
	it("ranks parent < filmer < admin", () => {
		expect(hasRole("manager", "filmer")).toBe(true);
		expect(hasRole("filmer", "filmer")).toBe(true);
		expect(hasRole("watcher", "filmer")).toBe(false);
	});
	it("recognises roles", () => {
		expect(isRole("filmer")).toBe(true);
		expect(isRole("manager")).toBe(true);
		expect(isRole("admin")).toBe(false); // "admin" is the site admin now, not a team role
	});
});
