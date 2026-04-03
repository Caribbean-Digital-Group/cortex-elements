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

if (!customElements.get('cortex-ocr')) {
  customElements.define('cortex-ocr', CortexOcr)
}

if (!customElements.get('cortex-identity')) {
  customElements.define('cortex-identity', CortexIdentity)
}

if (!customElements.get('cortex-signature')) {
  customElements.define('cortex-signature', CortexSignature)
}
