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
| Testing | Vitest + happy-dom | Unit tests en `tests/` |

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

La URL base se define al compilar con **`VITE_CORTEX_API_URL`** (archivo `.env`, `.env.production` o variable
de entorno del proceso; ver `.env.example`). `vite.config.ts` la valida (HTTPS, o `http://localhost` en dev) y la
incrusta en `dist/elements.js` como `DEFAULT_API_URL`. Cada element puede sobreescribirla con el atributo `api-url`.

```bash
# Build apuntando a otro backend sin tocar archivos
VITE_CORTEX_API_URL=https://staging.cortexverify.com npm run build
```
Todas las llamadas son `POST` JSON con `Authorization: Bearer <api-key>`. Los archivos viajan en base64;
las imágenes se optimizan en el navegador (`src/core/image.ts`: ≤2000 px, JPEG, EXIF corregido) antes de enviarse.

| Element | Endpoint | Payload |
|---|---|---|
| `cortex-ocr` | `/ocr/extract` | `{ file_base64, document_type: "auto"\|"ine"\|"curp"\|"cfdi"\|"csf", engine: "auto"\|"mistral"\|"glm" }` |
| `cortex-identity` | `/face/verify` | `{ document_image, selfie_image, check_liveness, threshold, extract_document, ocr_engine, external_id }` |
| `cortex-signature` | `/signature/compare` | `{ reference, sample, threshold, sample_source: "upload"\|"canvas", external_id }` |

Los tipos de respuesta viven en `src/types/` y reflejan exactamente el backend (ver `cortex/CLAUDE.md`).

**Errores:** el backend responde `{ detail, code }`. `ApiClient` los convierte en `CortexApiError(code, message, status)`
y el element emite `cortex:error` con `{ code, message }`. Códigos útiles para el integrador: `INVALID_API_KEY`,
`ORIGIN_NOT_ALLOWED`, `MONTHLY_QUOTA_EXCEEDED`, `RATE_LIMITED`, `FACE_NOT_DETECTED`, `UNSUPPORTED_DOCUMENT`,
`TIMEOUT`, `NETWORK_ERROR`. Ante `503` con `Retry-After` ≤ 10 s el cliente reintenta una vez.

**Seguridad del api-key:** el token vive en el HTML del cliente, así que es visible. La protección es la lista
`allowed_origins` del token (configurable en el dashboard): el backend rechaza orígenes no autorizados.

---

## Especificación de cada custom element

Atributos comunes: `api-key` (requerido), `api-url`, `theme` (`dark` | `light`), `show-result` (`true` | `false`).
Eventos comunes: `cortex:result`, `cortex:error` (`{ code, message }`), `cortex:loading` (`{ loading }`).
Callback: propiedad JS `element.onResult = (data) => {}` (nunca se evalúa el atributo `on-result`).
Cambiar un atributo de configuración re-renderiza el element. `element.reset()` vuelve al estado inicial.

### `<cortex-ocr />`

| Atributo | Default | Descripción |
|---|---|---|
| `document-type` | `auto` | `auto`, `ine`, `curp`, `cfdi`, `csf` |
| `mode` | `both` | `upload`, `camera` (trasera, con marco de credencial) o `both` |
| `sides` | `front` | Solo INE: `both` pide anverso y reverso y los une en una imagen (una sola llamada de OCR) |
| `engine` | `auto` | `auto` (Mistral con respaldo GLM), `mistral` o `glm` |
| `accept` | según tipo | `cfdi`/`auto` aceptan también XML |

Flujo: captura → `prepareUpload`/`stitchVertical` → `/ocr/extract` → `cortex:result` + panel con campos clave, validaciones y advertencias.

### `<cortex-identity />`

| Atributo | Default | Descripción |
|---|---|---|
| `liveness` | `true` | Prueba de vida anti-spoofing en el servidor |
| `threshold` | — | Similitud mínima adicional (0–1); por defecto decide el modelo |
| `extract-document` | `false` | Además extrae los datos de la INE en la misma llamada |
| `mode` | `both` | Captura de la INE en el paso 1: `upload`, `camera` o `both` |
| `external-id` | — | Referencia propia (expediente, folio, ≤100) que se guarda con la verificación |

Wizard de tres pasos con indicador de progreso (`.stepper`, `aria-current="step"`) y evento `cortex:step` (`{ step }`):
1. **Identificación**: INE por archivo o cámara trasera → "Continuar".
2. **Selfie**: **solo cámara frontal en vivo** (óvalo guía, vista espejo), nunca archivo adjunto; se enciende al entrar. "Atrás" apaga la cámara.
3. **Resultado**: progreso en línea (sin overlay) → panel. Éxito si `verified` y `similarity_approved`, advertencia si solo
   `verified`, error si no. Ante error de API: "Reintentar" (mismas fotos) o "Corregir fotos".

Optimización: cada imagen se optimiza en cuanto se captura (en paralelo con el siguiente paso); INE a ≤1600 px
(≤2000 px con `extract-document`, para OCR) y selfie a ≤1280 px. La respuesta trae `verification_id` y queda
registrada en el dashboard → Identidad (sin imágenes), donde se configura el nivel de `similarity_approved`.

### `<cortex-signature />`

| Atributo | Default | Descripción |
|---|---|---|
| `mode` | `both` | Tipo de comparación: `upload` (referencia vs adjunto), `canvas` (referencia vs dibujo) o `both` (el usuario elige) |
| `threshold` | servidor (0.80) | Similitud mínima para `authentic` |
| `external-id` | — | Referencia propia (contrato, folio, ≤100) que se guarda con la comparación |

Flujo: referencia ("Adjuntar archivo con firma digital") + muestra (adjunto o canvas con Pointer Events y trazo
suavizado, exporta al terminar cada trazo) → imágenes a ≤1200 px → `/signature/compare` con `sample_source`.
La respuesta trae dos decisiones: `authentic` (umbral del API) y `similarity_approved` (nivel de similitud
configurado por la cuenta en el dashboard → Comparables). El panel muestra éxito si ambas pasan, advertencia si
solo una. Cada comparación se registra en el dashboard (sin imágenes) con su `comparison_id`.

---

## Clase base `BaseElement`

`src/core/base-element.ts` monta el shadow DOM común (`[data-error]`, `[data-loading]`, `[data-body]`, `[data-result]`)
y llama `render(body)` del element. Helpers: `emit`, `setLoading(loading, message)`, `handleError` (solo `textContent`),
`requireClient`, `showResultPanel`, `callOnResult`, `reset`. Los subcomponentes de UI viven en `src/ui/`
(`capture-slot`, `file-dropzone`, `camera-capture`, `signature-canvas`, `result-panel`, `labels`).

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

### 1. Playground en `/dashboard/elements`

`ElementsPanel.vue` carga `elements.js` con `useElementsScript.ts` desde `VITE_ELEMENTS_URL`
(dev: `http://localhost:5174/elements.js`, servido por `npm run demo`; prod: CDN) y monta el element
real con la API key que el usuario pega (solo en `sessionStorage`).

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

# Tests (Vitest + happy-dom)
npm run test
```

### Workflow recomendado en dev

```bash
# Terminal 1 — construye y sirve elements.js en :5174 (demos + playground del dashboard)
cd cortex-elements && npm run demo

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

**Artifact de salida:** `dist/elements.js` (~13 KB gzip)

**Deploy a CDN:** El pipeline de CI sube `dist/elements.js` a `cdn.cortexverify.com` en cada merge a `main`.
