import { Buffer } from "buffer";

// @react-pdf/renderer expects Buffer while its lazy export chunk initializes.
(globalThis as Record<string, unknown>).Buffer = Buffer;
