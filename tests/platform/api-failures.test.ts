import { describe, expect, it } from "vitest";
import { createFetchBudget, FetchBudgetSpent } from "../../src/platform/fetch-budget.ts";
import { createStreamClient } from "../../src/platform/stream-client.ts";
import { createLiveClient } from "../../src/platform/stream-live.ts";

const answering = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const silent = (async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }) as unknown as typeof fetch;
const failure = async (p: Promise<unknown>) => (await p.catch((e: unknown) => e)) as Error;

describe("a failed call to Stream says which call, and Cloudflare's own error code", () => {
	it("Stream's videos: the call, the status, and the error's code and message", async () => {
		const stream = createStreamClient({ accountId: "acc", apiToken: "t", fetch: answering(500, { success: false, errors: [{ code: 10001, message: "internal" }] }) });
		expect((await failure(stream.details("abc"))).message).toBe("Stream GET abc failed (500): 10001 internal");
	});

	it("Stream's live inputs: the call names the input", async () => {
		const live = createLiveClient({ accountId: "acc", apiToken: "t", now: () => new Date(), fetch: answering(500, { success: false, errors: [{ code: 10002, message: "busy" }] }) });
		expect((await failure(live.isConnected("in1"))).message).toBe("Stream live GET /live_inputs/in1 failed (500): 10002 busy");
	});

	it("a call that times out says which one didn't answer, with the timeout as its cause", async () => {
		const stream = createStreamClient({ accountId: "acc", apiToken: "t", fetch: silent });
		const err = await failure(stream.details("abc"));
		expect(err.message).toBe("Stream GET abc didn't answer: TimeoutError");
		expect(String(err.cause)).toContain("TimeoutError");
		const live = createLiveClient({ accountId: "acc", apiToken: "t", now: () => new Date(), fetch: silent });
		expect((await failure(live.isConnected("in1"))).message).toBe("Stream live GET /live_inputs/in1 didn't answer: TimeoutError");
	});

	it("a call the run's budget refuses stays that refusal, so the work waits for the next run instead of failing it", async () => {
		const budget = createFetchBudget(0, answering(200, { success: true, result: {} }));
		const stream = createStreamClient({ accountId: "acc", apiToken: "t", fetch: budget.fetch });
		expect(await failure(stream.details("abc"))).toBeInstanceOf(FetchBudgetSpent);
		const live = createLiveClient({ accountId: "acc", apiToken: "t", now: () => new Date(), fetch: budget.fetch });
		expect(await failure(live.isConnected("in1"))).toBeInstanceOf(FetchBudgetSpent);
	});
});
