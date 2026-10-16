/** Retry-safe publication: an existing version must contain the exact validated archive. */
export async function ensureNpmPublication(
  tag: string,
  integrity: string,
  inspect: () => Promise<string | null>,
  publish: () => void
) {
  const existing = await inspect();
  if (existing !== null && existing !== integrity) {
    throw new Error(
      `${tag} already exists with different bytes; publish a new version`
    );
  }
  if (existing === null) {
    publish();
  }
  if ((await inspect()) !== integrity) {
    throw new Error(`npm readback failed for ${tag}`);
  }
}
