/**
 * cortex-elements — entry point
 *
 * Registers the three Cortex custom elements as a self-contained IIFE.
 * Idempotent: safe to load the script multiple times (e.g. in SPAs).
 *
 * Exported from dist/elements.js via CDN:
 *   <script src="https://cdn.cortexverify.com/elements.js"></script>
 */
import { CortexOcr } from './elements/cortex-ocr'
import { CortexIdentity } from './elements/cortex-identity'
import { CortexSignature } from './elements/cortex-signature'
import { reflectAttributes } from './core/reflect'

export const version = '2.0.0'

const ELEMENTS: Array<[string, CustomElementConstructor]> = [
  ['cortex-ocr', CortexOcr],
  ['cortex-identity', CortexIdentity],
  ['cortex-signature', CortexSignature],
]

for (const [tag, ctor] of ELEMENTS) {
  if (customElements.get(tag)) continue
  reflectAttributes(ctor)
  customElements.define(tag, ctor)
}

export type { OcrResult, DocumentType, OcrEngine } from './types/ocr'
export type { IdentityResult } from './types/identity'
export type { SignatureResult } from './types/signature'
