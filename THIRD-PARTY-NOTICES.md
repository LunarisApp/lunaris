# Third-party notices

Core Lunaris code is licensed under [MIT](LICENSE), with the exceptions
below. That grant does not
replace licenses or copyright notices belonging to other authors.

## Source exceptions

- `ee/`: proprietary Enterprise Edition code, copyright Roman Sirokov. The
  root MIT grant does not apply. Enterprise builds require permission under
  [its license](ee/LICENSE) and carry that text as `EE-LICENSE.txt`. Community
  builds exclude EE implementations.

- `apps/landing`: Tailwind Plus-derived components and template code remain under
  [the original Tailwind Plus license](apps/landing/LICENSE.md). They are excluded
  from the root MIT grant. See [landing licensing](apps/landing/README.md).
- `extensions/file/src/components/extend`: copied/adapted Extend code retains its
  [MIT license and copyright notice](extensions/file/src/components/extend/LICENSE.md).
- Dependencies, fonts, icons, and other third-party assets retain their upstream
  terms. Package metadata alone does not replace required license texts.

## Distribution notices

Web and desktop frontend builds generate `THIRD-PARTY-LICENSES.md` from bundled
npm modules, preserving package LICENSE, COPYING, COPYRIGHT and NOTICE files.
New missing texts fail the build. Known upstream gaps are explicitly marked in
the generated inventory and listed below; those markers are not license grants.
Pi 0.73.1 npm packages omit their MIT license file;
`tooling/licenses/pi-mono-LICENSE` preserves the upstream text from
[pi-mono v0.73.1](https://github.com/badlogic/pi-mono/blob/v0.73.1/LICENSE).
Review that override when upgrading Pi. Other npm omissions have version-pinned
upstream copies in `tooling/licenses/overrides.json`, with immutable source URLs.
These snapshots preserve upstream repository notices; they are not proof that
every historical package release contained identical terms.

Web output also includes this file, `LICENSE`, and `EXTEND-LICENSE.txt` at its root.
Enterprise web and desktop builds additionally include `EE-LICENSE.txt`.
Desktop packages carry these files, agent npm notices and Rust dependency notices
in their `notices` resources directory. CLI release archives include `LICENSE`
and cargo-about's `THIRD-PARTY-LICENSES.txt`; Homebrew retains both in `pkgshare`.
Install cargo-about 0.9.1 before packaging desktop releases.

## Bun runtime and source availability

The desktop agent embeds Bun. Its generated runtime notice records the exact Bun
version and source revision, with upstream licensing and build instructions.
Bun's JavaScriptCore/WebKit and other linked libraries have their own terms,
including LGPL obligations. The npm and Rust notice generators do not audit these
embedded native libraries. Before redistributing a desktop binary, review the
[Bun runtime license](https://bun.sh/docs/project/license), retain the corresponding
runtime/library license texts, and provide the required corresponding sources and
relinking materials alongside the release. A link to upstream alone is not a
complete compliance check.

Agent source lives in `apps/desktop/agent-work`; `bun.lock` records its dependencies.
Build with `bun install --frozen-lockfile`, build `packages/plugin-sdk`, then run
`bun run --cwd apps/desktop build:agent`. A modified Bun executable can be supplied
by adding Bun’s `--compile-executable-path` flag to the compile command in
`apps/desktop/scripts/build-agent.ts` (one matching architecture per build). For universal
macOS releases, build each architecture separately and combine using `lipo`.

## Maintaining notices

Run `bun test tooling/licenses` and build both frontend apps after dependency
changes. Worker module imports and installed Workbox runtime packages are included.
Review copied assets and native libraries separately; they may be outside the
JavaScript module graph. Review non-permissive
licenses and source-distribution requirements before shipping. Generated notices
are build artifacts; preserve them when deploying or repackaging.

## Unresolved upstream records

`tooling/licenses/review-required.json` tracks six exact package versions whose
published package and upstream repository have no standalone license text:

- `brotli@1.3.3`: npm says MIT; decoder source also contains Google Apache-2.0
  headers. Preserve both origins and obtain the wrapper's missing notice.
- `dfa@1.2.0` and `fontkit@2.0.4`: MIT declared; author Devon Govett.
- `media-engine@2.0.0`: MIT declared; author Diego Muracciole.
- `hsl-to-hex@1.0.0`: installed manifest says MIT, upstream README says ISC.
  Resolve that discrepancy with upstream before claiming a single license.
- `hsl-to-rgb-for-reals@1.1.1`: ISC declared; upstream README credits kayellpeee
  and nearForm without publishing the full license text.

Generated inventories preserve their package metadata and clearly label these
omissions. Obtain the missing copyright/permission texts or replace the affected
dependencies before treating the distribution notice audit as complete.
