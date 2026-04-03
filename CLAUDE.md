# CLAUDE.md — cortex-elements

## Visión del proyecto

`cortex-elements` es la librería pública de web components de Cortex. Empaqueta tres custom elements estándar (`cortex-ocr`, `cortex-identity`, `cortex-signature`) en un único archivo JavaScript (`elements.js`) que cualquier desarrollador puede incrustar en su sitio con una sola línea de código.

Este repo **no contiene lógica de IA** — actúa como cliente HTTP que:
1. Renderiza la UI de captura (upload, cámara, canvas)
2. Envía los datos al backend REST de Cortex
3. Expone el resultado al sitio del cliente vía callbacks y eventos DOM

La librería es consumida de dos formas:
- **Clientes externos** → via CDN: `https://cdn.cortexverify.com/elements.js`
- **cortex-verify (SaaS dashboard)** → via archivo local en dev, CDN en prod (para demos en vivo y documentación interactiva de la galería `/elements`)

---

## Ecosistema y repositorios relacionados

| Repo | Rol | URL |
|---|---|---|
| `cortex` | Backend REST (OCR, Face, Signature) | `https://github.com/Caribbean-Digital-Group/cortex` |
| `cortex-verify` | Dashboard SaaS (auth, tokens, billing, docs) | — |
| `cortex-elements` | **Este repo** — librería pública de web components | — |

### Flujo completo de una integración

```
Sitio del cliente
  └── <script src="elements.js">       ← este repo
        └── <cortex-ocr api-key="...">
              └── POST /ocr/document   ← backend `cortex`
                    └── on-result(json)
                          └── lógica del cliente
```

La API key que el cliente pasa en el atributo `api-key` es un token generado y gestionado desde el dashboard `cortex-verify`.

---

## Stack técnico

| Capa | Tecnología | Motivo |
|---|---|---|
| Lenguaje | TypeScript | Tipos compartidos entre elements y adoptantes |
| Web Components | Custom Elements API nativa | Sin framework — funciona en cualquier stack |
| Estilos | CSS Variables + Shadow DOM | Aislamiento de estilos, personalizable por el cliente |
| Build | Vite (library mode, formato IIFE) | Salida en un solo archivo sin dependencias externas |
| Linting | ESLint + Prettier | Consistencia de código |
| Testing | Vitest + @web/test-runner | Unit tests por component |

> **Sin frameworks de UI.** Los custom elements son vanilla TS + DOM API. No se usa Vue, React ni Lit para mantener el bundle mínimo y la compatibilidad universal.

---

## Estructura del proyecto

```
cortex-elements/
├── src/
│   ├── index.ts                  # Entry point — registra los tres custom elements
│   ├── elements/
│   │   ├── cortex-ocr.ts         # <cortex-ocr />
│   │   ├── cortex-identity.ts    # <cortex-identity />
│   │   └── cortex-signature.ts   # <cortex-signature />
│   ├── core/
│   │   ├── api-client.ts         # Wrapper fetch → backend Cortex
│   │   ├── base-element.ts       # Clase base con lógica común (api-key, errores, loading)
│   │   └── validators.ts         # Validación de atributos
│   ├── ui/
│   │   ├── file-dropzone.ts      # UI reutilizable: drag & drop + click to upload
│   │   ├── camera-capture.ts     # UI reutilizable: acceso a cámara + captura
│   │   └── signature-canvas.ts   # UI reutilizable: canvas de firma con trazos
│   ├── styles/
│   │   ├── base.css              # Reset y variables CSS del sistema de diseño
│   │   └── tokens.css            # Design tokens (colores, tipografía, radios)
│   └── types/
│       ├── ocr.ts                # OcrResult, OcrDocumentType
│       ├── identity.ts           # IdentityResult
│       └── signature.ts          # SignatureResult
├── dist/                         # Generado por build — NO commitear
│   └── elements.js
├── demo/                         # HTML de prueba para desarrollo local
│   ├── index.html
│   ├── ocr.html
│   ├── identity.html
│   └── signature.html
├── tests/
│   ├── cortex-ocr.test.ts
│   ├── cortex-identity.test.ts
│   └── cortex-signature.test.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Contrato de API con el backend (`cortex`)

La URL base del backend se configura en `src/core/api-client.ts` y puede sobreescribirse con el atributo `api-url` en cada element (útil en dev).

### Endpoints por element

#### `cortex-ocr` → `/ocr/*`

| Método | Endpoint | Payload | Cuándo usarlo |
|---|---|---|---|
| POST | `/ocr/document` | `multipart/form-data` con campo `file` | Upload de archivo (imagen o PDF) |
| POST | `/ocr/document/base64` | `{ "image": "base64string" }` | Captura de cámara |
| POST | `/ocr/image` | `multipart/form-data` con campo `file` | Imagen suelta sin estructura de documento |
| POST | `/ocr/image/base64` | `{ "image": "base64string" }` | Imagen suelta vía base64 |

**Respuesta esperada:**
```json
{
  "document_type": "INE",
  "name": "JUAN PÉREZ LÓPEZ",
  "curp": "PELJ800101HDFRNN09",
  "folio": "0123456789",
  "validity": "2026-12-31",
  "address": "CALLE EJEMPLO 123, CDMX"
}
```

#### `cortex-identity` → `/face/*`

| Método | Endpoint | Payload | Cuándo usarlo |
|---|---|---|---|
| POST | `/face/compare/url` | `{ "url1": string, "url2": string }` | Comparar dos fotos por URL pública |
| POST | `/face/compare/base64` | `{ "image1": string, "image2": string }` | Comparar foto del ID vs captura de cámara |

**Respuesta esperada:**
```json
{
  "verified": true,
  "similarity": 0.924,
  "liveness": true,
  "face_detected": true
}
```

#### `cortex-signature` → `/signature/*`

| Método | Endpoint | Payload | Cuándo usarlo |
|---|---|---|---|
| POST | `/signature/compare` | `multipart/form-data` con `reference` y `sample` | Comparar dos archivos de firma |

**Respuesta esperada:**
```json
{
  "authentic": true,
  "confidence": 0.881,
  "match_score": 0.91
}
```

### Autenticación

Todos los endpoints requieren el header:
```
Authorization: Bearer <api-key>
```

El valor de `api-key` proviene del atributo del custom element y es un token generado en `cortex-verify`.

---

## Especificación de cada custom element

### `<cortex-ocr />`

**Propósito:** Permitir al usuario cargar o fotografiar un documento. Extrae campos estructurados vía OCR.

**Atributos:**

| Atributo | Tipo | Requerido | Default | Descripción |
|---|---|---|---|---|
| `api-key` | `string` | ✅ | — | Token de API de Cortex |
| `api-url` | `string` | — | `https://api.cortexverify.com` | Base URL del backend (útil en dev) |
| `accept` | `string` | — | `image/*,application/pdf` | MIME types aceptados |
| `lang` | `string` | — | `es` | Idioma del output JSON |
| `mode` | `'upload' \| 'camera' \| 'both'` | — | `both` | Modo de captura disponible |
| `on-result` | `function` | — | — | Callback con el JSON extraído |

**Eventos DOM emitidos:**
- `cortex:result` — detalle: el JSON de extracción
- `cortex:error` — detalle: `{ code, message }`
- `cortex:loading` — detalle: `{ loading: boolean }`

**Flujo interno:**
1. Renderiza dropzone + botón de cámara según `mode`
2. Usuario sube archivo o captura foto
3. Si es archivo → `POST /ocr/document` (multipart)
4. Si es captura → convierte a base64 → `POST /ocr/document/base64`
5. Emite `cortex:result` y llama `on-result` con el JSON

---

### `<cortex-identity />`

**Propósito:** Verificación biométrica. Compara la foto de una identificación oficial contra una captura facial en tiempo real.

**Atributos:**

| Atributo | Tipo | Requerido | Default | Descripción |
|---|---|---|---|---|
| `api-key` | `string` | ✅ | — | Token de API de Cortex |
| `api-url` | `string` | — | `https://api.cortexverify.com` | Base URL del backend |
| `liveness` | `boolean` | — | `true` | Activa detección anti-spoof |
| `threshold` | `number` | — | `0.75` | Score mínimo de similitud para considerar verificado |
| `on-result` | `function` | — | — | Callback con el resultado de verificación |

**Eventos DOM emitidos:**
- `cortex:result` — detalle: `{ verified, similarity, liveness, face_detected }`
- `cortex:error`
- `cortex:loading`

**Flujo interno:**
1. Paso 1 — usuario sube o fotografía su identificación oficial
2. Paso 2 — activa cámara para captura facial en vivo
3. Convierte ambas imágenes a base64
4. `POST /face/compare/base64` con `image1` (ID) e `image2` (selfie)
5. Evalúa si `similarity >= threshold` y emite resultado

---

### `<cortex-signature />`

**Propósito:** Comparar una firma de referencia (upload) contra una muestra (upload o canvas interactivo).

**Atributos:**

| Atributo | Tipo | Requerido | Default | Descripción |
|---|---|---|---|---|
| `api-key` | `string` | ✅ | — | Token de API de Cortex |
| `api-url` | `string` | — | `https://api.cortexverify.com` | Base URL del backend |
| `mode` | `'upload' \| 'canvas' \| 'both'` | — | `both` | Cómo se captura la muestra |
| `accept` | `string` | — | `image/*,application/pdf` | Tipos aceptados para upload |
| `on-result` | `function` | — | — | Callback con el resultado de comparación |

**Eventos DOM emitidos:**
- `cortex:result` — detalle: `{ authentic, confidence, match_score }`
- `cortex:error`
- `cortex:loading`

**Flujo interno:**
1. Panel izquierdo — sube firma de referencia
2. Panel derecho — sube muestra o dibuja en canvas
3. Si canvas → exporta como PNG blob
4. `POST /signature/compare` (multipart) con `reference` y `sample`
5. Emite resultado

---

## Clase base `BaseElement`

Todos los elements extienden `BaseElement` que provee:

```ts
abstract class BaseElement extends HTMLElement {
  protected apiKey: string
  protected apiUrl: string
  protected loading: boolean

  // Ciclo de vida
  connectedCallback(): void        // lee atributos, renderiza shadow DOM
  attributeChangedCallback(): void

  // Helpers
  protected emit(event: string, detail: unknown): void
  protected setLoading(loading: boolean): void
  protected handleError(error: unknown): void
  protected callOnResult(result: unknown): void
}
```

---

## Personalización de estilos (CSS Variables)

Los elementos exponen variables CSS que el cliente puede sobreescribir:

```css
cortex-ocr {
  --cortex-primary: #06b6d4;        /* Color de acento */
  --cortex-bg: #0f172a;             /* Fondo del componente */
  --cortex-border: rgba(255,255,255,0.1);
  --cortex-radius: 0.75rem;
  --cortex-font: inherit;
}
```

El Shadow DOM usa estas variables — el cliente no puede romper los estilos internos pero sí adaptar el look al de su producto.

---

## Integración con cortex-verify (dashboard SaaS)

El dashboard usa los elements de dos formas:

### 1. Demos en vivo en `/elements`

El panel `ElementsPanel.vue` incrusta los web components reales en un iframe sandbox para las demos interactivas. En dev apunta al archivo local:

```ts
// cortex-verify: src/composables/useElementsScript.ts
const ELEMENTS_URL = import.meta.env.DEV
  ? '/elements/elements.js'          // servido desde public/
  : 'https://cdn.cortexverify.com/elements.js'
```

El build de `cortex-elements` en modo `--watch` deposita `dist/elements.js` en `cortex-verify/public/elements/elements.js`.

### 2. Tipos compartidos (opcional)

Si se publica como paquete npm interno, `cortex-verify` puede importar los tipos de respuesta:

```ts
import type { OcrResult, IdentityResult, SignatureResult } from '@cortex/elements'
```

---

## Scripts de desarrollo

```bash
# Instalar dependencias
npm install

# Modo watch — reconstruye elements.js al guardar
npm run dev

# Build de producción
npm run build

# Servir demos locales en localhost:5174
npm run demo

# Tests
npm run test

# Lint
npm run lint
```

### Workflow recomendado en dev

```bash
# Terminal 1 — reconstruye elements.js
cd cortex-elements && npm run dev

# Terminal 2 — dashboard (consume el elements.js generado)
cd cortex-verify && npm run dev
```

---

## Convenciones de código

- Cada element vive en su propio archivo en `src/elements/`
- No usar frameworks de UI (Vue, React, Lit) — vanilla TS + DOM API únicamente
- Los estilos van dentro del Shadow DOM como template literal CSS
- Los eventos DOM siempre tienen el prefijo `cortex:` (e.g. `cortex:result`)
- Los callbacks de atributo (`on-result`) se ejecutan como property del elemento, no con `new Function()`
- No hacer bundle de dependencias externas — el output final debe ser un IIFE autocontenido
- Las llamadas al backend siempre pasan por `src/core/api-client.ts`

---

## Build y distribución

```ts
// vite.config.ts
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'CortexElements',
      formats: ['iife'],
      fileName: () => 'elements.js',
    },
    minify: 'terser',
    sourcemap: false,   // true solo en staging
  },
})
```

**Artifact de salida:** `dist/elements.js` (~30-60 KB gzip estimado sin imágenes)

**Deploy a CDN:** El pipeline de CI sube `dist/elements.js` a `cdn.cortexverify.com` en cada merge a `main`.
