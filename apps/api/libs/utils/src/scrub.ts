/**
 * Backend re-export of the shared PII scrubber. Kept here so existing
 * `@app/utils/scrub` import paths continue to work without churning every
 * call site.
 */
export { scrubError, scrubMaybe, scrubString } from "@repo/utils";
