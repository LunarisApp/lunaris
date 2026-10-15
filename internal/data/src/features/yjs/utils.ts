/**
 * Convert a base64 string to an array of uint8 values.
 * Useful when a record from database is stored as a base64 string,
 * and we want to apply it as a Yjs update in binary format.
 * @param base64
 */
export function b64ToUint8Array(base64: string) {
  const asCharCode = (c: string) => c.charCodeAt(0);
  return Uint8Array.from(atob(base64), asCharCode);
}

/**
 * Convert an array of uint8 values to a base64 string.
 * Useful when we want to store a Yjs update in database as a base64 string.
 * @param uint8array
 * @constructor
 */
export function Uint8ArrayTob64(uint8array: Uint8Array) {
  const output: string[] = [];
  for (let i = 0, { length } = uint8array; i < length; i++) {
    const charCode = uint8array[i];
    if (charCode === undefined) {
      throw new Error("Invalid uint8array value");
    }
    output.push(String.fromCharCode(charCode));
  }
  return btoa(output.join(""));
}
