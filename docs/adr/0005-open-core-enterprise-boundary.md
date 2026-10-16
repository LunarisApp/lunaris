# 0005: Keep enterprise features separate from the open core

- Status: Accepted
- Date: 2026-10-14

## Context

Lunaris should remain useful to people who use, self-host, inspect, and extend it.
Maintaining that platform takes ongoing work in development, security,
compatibility, documentation, and support.

Enterprise features such as team administration and audit review create extra
work and a way to fund it. If all that code used the core's permissive license,
other providers could resell it without supporting its development.

## Decision

Use an open-core model: keep the community foundation under MIT and place
selected enterprise implementations in `ee/` under a separate proprietary license.
Other documented repository license exceptions remain unchanged.

### Fund development through enterprise licensing

Reserve selected administration and governance features for commercial licensing.
Today, `ee/` contains audit signing, storage and review, team enablement and
interfaces, and their application integration.

This protects the commercial value of enterprise code while keeping the core
open. Competing uses of the open-source core remain allowed under its license,
and others can build independent alternatives.

[`ee/LICENSE`](../../ee/LICENSE) requires a separate written license for use,
copying, modification, and distribution, except as permitted by law. This applies
more broadly than just to competitors. The license controls those rights;
this ADR does not change them. Visible source is not necessarily open source,
and third-party dependencies keep their own licenses.

### Keep Community Edition useful

Community remains the default, with the core workspace experience, offline-first
behavior, and public extension API from
[ADR 0003](0003-extensible-workspace-platform.md).

Choose enterprise features explicitly. Core permissions and security checks stay
in core, and ordinary community use does not depend on enterprise packages or a
commercial license service.

### Separate editions at build time

Enterprise packages depend on core; core libraries do not import enterprise
implementations. Application entry points add enterprise server modules and client
providers, with separate client and server exports.

`LUNARIS_EDITION` selects `community` or `enterprise` at build time. Community
builds omit enterprise endpoints and UI; the self-hosted Community Edition API
image excludes enterprise code and dependencies. Enabling omitted code requires
a rebuild.

Build selection, subscription entitlements, and licensing are separate. Commercial
license validation is not currently implemented, and choosing an enterprise build
does not grant a license.

Keep existing schemas, migrations, and data when disabling enterprise features.
An edition change must not silently delete data. Community builds preserve old
audit data but stop writing new signed compliance records; see
[ADR 0004](0004-enterprise-audit-logs.md).

## Alternatives considered

- **Open-source everything; charge for hosting or support:** allows broader reuse,
  including competing redistribution of enterprise implementations.
- **Make everything proprietary:** conflicts with the open community foundation.
- **Use a private enterprise repository:** hides the code but complicates coordinated
  changes, testing, and inspection.
- **Ship everything behind runtime flags:** leaves enterprise code in community
  artifacts instead of separating what each edition distributes.

## Consequences

Enterprise licensing can fund the shared platform. The explicit directory and
build boundaries make feature placement visible, while preserving community
extensibility and data across edition changes.

Mixed licensing needs clear notices and documentation; the whole repository is
not open source. Both editions need checks for accidental imports and unintended
behavior differences. Some contributors will prefer fully open-source software,
so future feature placement must be deliberate and clearly explained. Licensing
sets terms for reuse; it cannot technically prevent copying or competition.

## References

- [Enterprise packages and composition](../../ee/README.md)
- [Enterprise license](../../ee/LICENSE)
- [Core license](../../LICENSE)
- [Repository license boundaries](../../README.md#license)
- [Edition selector](../../tooling/editions/edition.ts)
- [API enterprise composition](../../apps/api/src/enterprise/edition.ts)
- [Client enterprise composition](../../ee/composition/src/edition.tsx)
