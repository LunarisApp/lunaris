/** Product trunk: package automation may open PRs, never bypass their checks. */
export function productRulesets(
  appId: number,
  maintainerId: number,
  maintainerType: "Team" | "User" = "Team"
) {
  if (
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    !Number.isSafeInteger(maintainerId) ||
    maintainerId <= 0
  ) {
    throw new Error("Valid release App ID and maintainer ID required");
  }
  const app = {
    actor_id: appId,
    actor_type: "Integration",
    bypass_mode: "always",
  };
  const owners = {
    actor_id: maintainerId,
    actor_type: maintainerType,
    bypass_mode: "pull_request",
  };
  const branches = {
    ref_name: { include: ["refs/heads/main"], exclude: [] },
  };
  const historicalTags = {
    ref_name: {
      include: [
        "refs/tags/@lunarisapp/plugin-sdk@*",
        "refs/tags/@lunarisapp/ui@*",
        ...["api", "web", "docs", "landing", "self-hosted"].map(
          (name) => `refs/tags/${name}@*`
        ),
        "refs/tags/v*",
        "refs/tags/cli@*",
        "refs/tags/desktop@*",
      ],
      exclude: [],
    },
  };
  return [
    {
      name: "Release branches - immutable history",
      target: "branch",
      enforcement: "active",
      conditions: branches,
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    },
    {
      name: "Release branches - checks",
      target: "branch",
      enforcement: "active",
      conditions: branches,
      bypass_actors: [],
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            required_status_checks: [{ context: "CI", integration_id: 15_368 }],
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
          },
        },
        {
          type: "code_scanning",
          parameters: {
            code_scanning_tools: [
              {
                tool: "CodeQL",
                security_alerts_threshold: "high_or_higher",
                alerts_threshold: "errors",
              },
            ],
          },
        },
      ],
    },
    {
      name: "Release main - PRs",
      target: "branch",
      enforcement: "active",
      conditions: branches,
      bypass_actors: [owners],
      rules: [
        {
          type: "pull_request",
          parameters: {
            required_approving_review_count: 1,
            require_code_owner_review: true,
            dismiss_stale_reviews_on_push: true,
            require_last_push_approval: true,
            required_review_thread_resolution: true,
            allowed_merge_methods: ["squash"],
          },
        },
      ],
    },
    {
      // Creation rules apply only to current product/npm tags. Historical tags stay immutable.
      name: "Release tags - creation",
      target: "tag",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: [
            "refs/tags/v*",
            "refs/tags/@lunarisapp/plugin-sdk@*",
            "refs/tags/@lunarisapp/ui@*",
          ],
          exclude: [],
        },
      },
      bypass_actors: [app],
      rules: [
        { type: "creation" },
        {
          type: "tag_name_pattern",
          parameters: {
            name: "Stable package versions",
            operator: "regex",
            pattern:
              "^(v|@lunarisapp/(plugin-sdk|ui)@)(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
            negate: false,
          },
        },
      ],
    },
    {
      name: "Release tags - immutable",
      target: "tag",
      enforcement: "active",
      conditions: historicalTags,
      bypass_actors: [],
      rules: [{ type: "update" }, { type: "deletion" }],
    },
  ];
}
