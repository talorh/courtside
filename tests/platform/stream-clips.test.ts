import { describe, expect, it } from "vitest";
import { createClipper } from "../../src/platform/stream-clips.ts";
import { fakeFetch } from "../helpers/fake-fetch.ts";

const fake = (status: number, body: unknown) => {
	const { calls, fetch } = fakeFetch({ status, body });
	return { fn: fetch, calls };
};

describe("Stream clipper", () => {
	it("posts a signed-URL clip with the token, labels the new video with its team (Stream's clip call keeps only the name), and returns the uid", async () => {
		const f = fake(200, { success: true, result: { uid: "new-uid" } });
		const clipper = createClipper({ accountId: "acct", apiToken: "secret", fetch: f.fn, site: "staging" });
		const uid = await clipper.clip({ sourceUid: "src", startSeconds: 60, endSeconds: 75, name: "Q4 dagger", teamId: "g14.5-2026", scheduledDeletion: "2028-10-14T00:00:00.000Z" });
		expect(uid).toBe("new-uid");
		expect(f.calls[0]?.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/stream/clip");
		expect((f.calls[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
		expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({
			clippedFromVideoUID: "src", startTimeSeconds: 60, endTimeSeconds: 75, requireSignedURLs: true,
			meta: { name: "Q4 dagger", teamId: "g14.5-2026", site: "staging" }, scheduledDeletion: "2028-10-14T00:00:00.000Z",
		});
		expect(f.calls[1]?.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/stream/new-uid");
		expect(f.calls[1]?.init.method).toBe("POST");
		expect(JSON.parse(String(f.calls[1]?.init.body))).toEqual({ meta: { name: "Q4 dagger", teamId: "g14.5-2026", site: "staging" } });
	});
	it("still returns the clip when labelling it fails, and says so", async () => {
		const { calls, fetch } = fakeFetch({ status: 200, body: { success: true, result: { uid: "u" } } }, { status: 500, body: { success: false } });
		const warned: string[] = [];
		const warn = console.warn;
		console.warn = (line: string) => void warned.push(line);
		try {
			expect(await createClipper({ accountId: "a", apiToken: "t", fetch }).clip({ sourceUid: "s", startSeconds: 0, endSeconds: 5, name: "n", teamId: "t1" })).toBe("u");
		} finally {
			console.warn = warn;
		}
		expect(calls).toHaveLength(2);
		expect(warned.map((l) => JSON.parse(l))).toEqual([{ event: "clip_label_failed", teamId: "t1", uid: "u" }]);
	});
	it("leaves out scheduledDeletion when not given", async () => {
		const f = fake(200, { success: true, result: { uid: "u" } });
		await createClipper({ accountId: "a", apiToken: "t", fetch: f.fn }).clip({ sourceUid: "s", startSeconds: 0, endSeconds: 5, name: "n", teamId: "t" });
		expect(JSON.parse(String(f.calls[0]?.init.body))).not.toHaveProperty("scheduledDeletion");
	});
	it("throws with Stream's message on failure", async () => {
		const f = fake(400, { success: false, errors: [{ message: "end time exceeds duration" }] });
		const clipper = createClipper({ accountId: "a", apiToken: "t", fetch: f.fn });
		await expect(clipper.clip({ sourceUid: "s", startSeconds: 0, endSeconds: 5, name: "n", teamId: "t" })).rejects.toThrow(/400.*end time exceeds duration/);
	});
});
