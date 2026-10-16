import type { HandoffReviewer } from "@surgical-pruning/core";
import { describe, expect, it, vi } from "vitest";
import { runResearcher } from "../src/index.js";

// Hermetic offline mode. runResearcher calls webSearch(query, 3, 8000), and
// webSearch can spend 8000ms on DuckDuckGo plus a second 8000ms on the Wikipedia
// fallback — up to 16s, far beyond vitest's 5s default. That made this suite
// pass only on a fast network. cite() delegates to webSearch internally, so it
// must be stubbed alongside (an internal call is not routed through the mocked
// module export).
vi.mock("@surgical-pruning/core", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@surgical-pruning/core")>();
	return {
		...actual,
		webSearch: vi.fn(async () => [
			{
				title: "Mock: dead-code removal best practice",
				url: "https://example.com/practice",
				snippet: "stubbed",
			},
		]),
		cite: vi.fn(async (_query: string, fallback: string) => fallback),
	};
});

const fakeReviewerHandoff = {
	metadata: {
		target_path: "/tmp/x",
		scan_timestamp: new Date().toISOString(),
		scan_duration_ms: 0,
		git_root: "/tmp/x",
		git_branch: "main",
		git_commit: "abc1234",
	},
	tree_diagram: "",
	file_inventory: [],
	folder_summary: [],
	effected_systems: [],
	constraints: {
		exclusion_patterns_applied: [],
		languages_detected: ["typescript", "python"],
		frameworks_detected: [],
		package_managers: ["pnpm"],
		monorepo: false,
	},
} as unknown as HandoffReviewer;

describe("researcher/runResearcher", () => {
	it("returns a structured handoff covering all five sections", async () => {
		const out = await runResearcher({
			targetPath: "/tmp/x",
			userPrompt: "remove dead code aggressively",
			reviewerHandoff: fakeReviewerHandoff,
			cwd: process.cwd(),
		});
		expect(out.user_prompt_analysis.intent).toBe("dead-code-removal");
		expect(out.user_prompt_analysis.aggressiveness).toBe("aggressive");
		expect(out.language_specific_practices).toHaveProperty("typescript");
		expect(out.language_specific_practices).toHaveProperty("python");
		expect(Array.isArray(out.general_practices)).toBe(true);
		expect(Array.isArray(out.tool_recommendations)).toBe(true);
		expect(typeof out.future_proofing).toBe("object");
	});

	it("derives scope=monorepo when the reviewer reports a monorepo", async () => {
		const monorepoHandoff = {
			...fakeReviewerHandoff,
			constraints: { ...fakeReviewerHandoff.constraints, monorepo: true },
		};
		const out = await runResearcher({
			targetPath: "/tmp/x",
			userPrompt: "cleanup",
			reviewerHandoff: monorepoHandoff,
			cwd: process.cwd(),
		});
		expect(out.user_prompt_analysis.scope).toBe("monorepo");
	});
});
