export function releaseRulesets(appId: number, maintainerTeamId: number) {
  if (
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    !Number.isSafeInteger(maintainerTeamId) ||
    maintainerTeamId <= 0
  ) {
    throw new Error("Valid release App ID and code-owner team ID required");
  }
  const app = {
    actor_id: appId,
    actor_type: "Integration",
    bypass_mode: "always",
  };
  const owners = {
    actor_id: maintainerTeamId,
    actor_type: "Team",
    bypass_mode: "pull_request",
  };
  const branches = {
    ref_name: { include: ["refs/heads/main", "refs/heads/next"], exclude: [] },
  };
  const tags = {
    ref_name: {
      include: [
        "refs/tags/@lunarisapp/plugin-sdk@*",
        "refs/tags/@lunarisapp/ui@*",
        ...["api", "web", "docs", "landing", "self-hosted"].map(
          (name) => `refs/tags/${name}@*`
        ),
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
      bypass_actors: [app],
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
    ...["main", "next"].map((branch) => ({
      name: `Release ${branch} - PRs`,
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: [`refs/heads/${branch}`], exclude: [] },
      },
      bypass_actors: [app, owners],
      rules: [
        {
          type: "pull_request",
          parameters: {
            required_approving_review_count: 1,
            require_code_owner_review: true,
            dismiss_stale_reviews_on_push: true,
            require_last_push_approval: true,
            required_review_thread_resolution: true,
            allowed_merge_methods: branch === "main" ? ["merge"] : ["squash"],
          },
        },
      ],
    })),
    {
      name: "Release tags - creation",
      target: "tag",
      enforcement: "active",
      conditions: tags,
      bypass_actors: [app],
      rules: [
        { type: "creation" },
        {
          type: "tag_name_pattern",
          parameters: {
            name: "Stable package versions",
            operator: "regex",
            pattern:
              "^(@lunarisapp/(plugin-sdk|ui)|api|web|docs|landing|self-hosted)@[0-9]+\\.[0-9]+\\.[0-9]+$",
            negate: false,
          },
        },
      ],
    },
    {
      name: "Release tags - immutable",
      target: "tag",
      enforcement: "active",
      conditions: tags,
      bypass_actors: [],
      rules: [{ type: "update" }, { type: "deletion" }],
    },
  ];
}
if (import.meta.main) {
  console.log(
    JSON.stringify(
      releaseRulesets(Number(process.argv[2]), Number(process.argv[3])),
      null,
      2
    )
  );
}
