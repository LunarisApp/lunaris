/** Decimal storage units throughout billing and quota messages. */
export function formatStorageBytes(bytes: number, locale?: string) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError("Bytes must be a non-negative safe integer");
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index =
    bytes === 0
      ? 0
      : Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index === 0 ? 0 : 2 }).format(bytes / 1000 ** index)} ${units[index]}`;
}
