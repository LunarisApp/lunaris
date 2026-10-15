/// <reference path="../../globals.d.ts" />

import type { PdfEngine } from "@embedpdf/models"
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url"

let sharedEnginePromise: Promise<PdfEngine> | null = null

export function loadSharedPdfEngine() {
  sharedEnginePromise ??= import("@embedpdf/engines/pdfium-worker-engine").then(
    ({ createPdfiumEngine }) => createPdfiumEngine(pdfiumWasmUrl, {})
  )

  return sharedEnginePromise
}
