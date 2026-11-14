import { defineConfig } from "vitest/config";

// Node's own localStorage is off: the tests stand in for the browser's (vi.stubGlobal), and Node's warns when read.
export default defineConfig({
	test: { environment: "node", include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"], execArgv: ["--no-webstorage"] },
});
