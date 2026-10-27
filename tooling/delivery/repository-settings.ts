import { productRulesets } from "../release/automation/rulesets";

export const trunkSettings = {
  default_branch: "main",
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  allow_auto_merge: true,
  delete_branch_on_merge: true,
};
export interface RuleSnapshot {
  enforcement: string;
  id: number;
  name: string;
  source?: string;
  source_type?: string;
}
export function desiredRules(
  appId: number,
  maintainerId: number,
  maintainerType: "Team" | "User" = "Team"
) {
  return [
    ...productRulesets(appId, maintainerId, maintainerType),
    {
      name: "Retired next - frozen",
      target: "branch",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/heads/next"], exclude: [] } },
      bypass_actors: [],
      rules: [
        { type: "update" },
        { type: "deletion" },
        { type: "non_fast_forward" },
      ],
    },
  ];
}
export function assertWritableRules(rules: RuleSnapshot[], repository: string) {
  const inherited = rules.filter(
    (rule) =>
      rule.enforcement === "active" && rule.source && rule.source !== repository
  );
  if (inherited.length) {
    throw new Error(
      `Inherited rules require explicit review before cutover: ${inherited.map((rule) => `${rule.name} (${rule.id})`).join(", ")}`
    );
  }
}
export function assertSettings(actual: Record<string, unknown>) {
  for (const [key, value] of Object.entries(trunkSettings)) {
    if (actual[key] !== value) {
      throw new Error(`GitHub setting readback failed: ${key}`);
    }
  }
}

/** Compare requested policy fields; GitHub supplies additional default fields. */
export function assertRuleset(
  actual: unknown,
  expected: unknown,
  path = "ruleset"
): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`Ruleset readback mismatch: ${path}`);
    }
    for (const [index, value] of expected.entries()) {
      assertRuleset(actual[index], value, `${path}[${index}]`);
    }
    return;
  }
  if (expected !== null && typeof expected === "object") {
    if (
      actual === null ||
      typeof actual !== "object" ||
      Array.isArray(actual)
    ) {
      throw new Error(`Ruleset readback mismatch: ${path}`);
    }
    for (const [key, value] of Object.entries(expected)) {
      assertRuleset(
        (actual as Record<string, unknown>)[key],
        value,
        `${path}.${key}`
      );
    }
    return;
  }
  if (actual !== expected) {
    throw new Error(`Ruleset readback mismatch: ${path}`);
  }
}
