# Security policy

## Supported versions

Security fixes target the latest released version of each Lunaris application
and public package, and the current `main` branch. Older releases do not have a
separate security maintenance commitment. Self-hosted installations should keep
their applications and infrastructure dependencies up to date.

## Report a vulnerability

Email [security@lunaris.app](mailto:security@lunaris.app). Do not disclose an
unfixed vulnerability in a public issue, discussion, or pull request.

Include:

- The affected application or package, version or commit, and deployment type
  (hosted, self-hosted, or local).
- Reproduction steps or a minimal proof of concept.
- The expected and observed behavior, potential impact, and relevant logs with
  secrets and personal data removed.

Do not send production credentials, private keys, or other users' content.
Use your own accounts and data when reproducing a problem. Stop testing if it
would expose someone else's data or disrupt a service.

The maintainer will review the report and coordinate any fix and disclosure
through the private email thread. Please coordinate public disclosure so users
have an opportunity to update. This policy does not promise a response deadline
or a bug bounty.

For ordinary bugs and feature requests, use
[GitHub issues](https://github.com/LunarisApp/lunaris/issues).
