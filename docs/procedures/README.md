# Maintenance Procedures

Step-by-step instructions for non-trivial maintenance tasks, including
prerequisites, verification, and recovery steps where applicable.

Use this folder for repeatable operational work that needs more context than a
single command: migrations, restores, credential rotation, or incident recovery.
Write for the maintainer performing the task, including someone doing it for the
first time.

Each procedure should explain when to use it, what it changes, and how to confirm
success. Link architectural reasoning to an [ADR](../adr/README.md) and reuse
existing setup instructions through links.

## Conventions

- Name files after the task using kebab-case, such as `restore-database.md`.
- State the supported environment and required access before the steps.
- Identify downtime, destructive actions, and required backups before execution.
- Use numbered steps with exact commands and expected results. Explain every
  placeholder; never include credentials or other secrets.
- Include stop conditions and recovery instructions. If rollback is unavailable,
  say so and document the recovery path.
- Record the last verified date and environment; update them after validation.

## Template

Copy this into a new file and replace the placeholders. The command placeholder
below is illustrative; replace it with verified instructions before use.

````markdown
# <Maintenance task>

- Last verified: YYYY-MM-DD
- Verified environment: <Environment and relevant versions>

## Purpose and scope

<When to use this procedure, intended outcome, and affected services or data.>

## Prerequisites

- <Required access, tools, and environment selection.>
- <Required backup and how to verify it can be restored.>

## Impact

<Expected downtime, user impact, and any irreversible changes. State none if applicable.>

## Steps

1. <Confirm the target environment and starting state. Stop if checks fail.>
2. <Perform the maintenance action. Explain any placeholders before the command.>

   ```sh
   # Replace with a verified command for this step.
   ```

   Expected result: <Observable output or state.>

## Verification

- <Check that confirms the intended result.>
- <Check that affected services and user workflows still work.>

## Recovery

<When to stop, how to roll back or recover, and how to verify recovery.
If rollback is unavailable, explain the alternative recovery path.>

## References

- <Links to related setup guides, ADRs, or supporting tools.>
````
