# cortex-elements

Código fuente de los web components públicos de Cortex: `<cortex-ocr>`, `<cortex-identity>` y `<cortex-signature>`. Se compilan a un único archivo, **`dist/elements.js`** (IIFE, sin dependencias), que los clientes incrustan en su sitio con una línea:

```html
<script src="https://cortexverify.netlify.app/elements.js"></script>
<cortex-ocr api-key="ctx_..."></cortex-ocr>
```

Es una **librería, no una app**: no tiene servidor propio ni lógica de IA. Los components renderizan la captura (upload, cámara, canvas), llaman al backend `cortex` y entregan el resultado por callbacks y eventos DOM.

## Rol en el ecosistema

| Repo | Rol con respecto a elements.js |
|---|---|
| `cortex-elements` (este) | **Escribe y compila** los components → `dist/elements.js` |
| `cortex-verify` (dashboard) | **Sirve** el archivo: en dev lo lee desde `../cortex-elements/dist/` para el playground; en prod lo publica como `public/elements.js` en Netlify |
| `cortex` (backend) | Recibe las llamadas de los components (`/ocr`, `/face`, `/signature`) |

```
cortex-elements          cortex-verify                         sitio del cliente
src/*.ts ──build──▶ dist/elements.js ──elements:sync──▶ public/elements.js ──Netlify──▶ <script src=".../elements.js">
                         │
                         └──(dev) servido en /elements/elements.js para el playground del dashboard
```

> No hace falta levantar este repo en un puerto para usar el dashboard: basta con que exista `dist/elements.js`.

## Scripts

| Comando | Qué hace | Puerto |
|---|---|---|
| `npm run dev` | `vite build --watch`: recompila `dist/elements.js` en cada cambio. Úsalo junto con el dashboard en dev | — |
| `npm run build` | Type-check + build | — |
| `npm run build-only` | Build sin type-check | — |
| `npm run demo` | Build + páginas de prueba aisladas en `demo/` (ocr, identity, signature), sin el dashboard | **5174** |
| `npm test` | Pruebas unitarias (Vitest + happy-dom, en `tests/`) | — |
| `npm run type-check` / `npm run lint` | TypeScript / ESLint | — |

## URL del backend

El build **incrusta** la URL del backend en `elements.js` (`VITE_CORTEX_API_URL`). Ver `.env.example`.

- Orden: variable de entorno del proceso > `.env.[mode]` > `.env` > `https://api.cortexverify.com`.
- Debe ser HTTPS (se permite `http://localhost` / `127.0.0.1` para desarrollo); si no, el build falla.
- Cada element puede sobreescribirla con el atributo `api-url`.

Por eso el `.env` local (`http://localhost:8000`) sirve para desarrollo, pero **no** para publicar.

## Flujos de trabajo

### Desarrollo con el dashboard

```bash
# terminal 1 — cortex-elements
npm run dev            # deja dist/elements.js actualizado (apunta a localhost:8000)

# terminal 2 — cortex-verify
npm run dev            # el playground carga /elements/elements.js desde este repo
```

### Probar los components de forma aislada

```bash
npm run demo           # http://localhost:5174
```

### Publicar una versión nueva para los clientes

```bash
cd ../cortex-elements && VITE_CORTEX_API_URL=https://cortex-production-13b3.up.railway.app npm run build-only
cd ../cortex-verify && npm run elements:sync   # copia a public/elements.js; rechaza builds con localhost
# commit + deploy de cortex-verify → https://cortexverify.netlify.app/elements.js
```

Este repo no se despliega por sí mismo: la versión pública cambia solo cuando se despliega `cortex-verify` con el nuevo `public/elements.js`.

## Estructura

```
src/
├── index.ts        # registra los tres custom elements
├── elements/       # cortex-ocr, cortex-identity, cortex-signature
├── core/           # api-client, base-element, validators
├── ui/             # dropzone, cámara, canvas de firma
├── styles/         # tokens y estilos (Shadow DOM + CSS variables)
└── types/          # tipos de resultado
demo/               # páginas de prueba de `npm run demo`
tests/              # Vitest
```

Sin frameworks de UI: TypeScript + Custom Elements API nativa. La referencia de atributos, eventos y contratos está en `CLAUDE.md` y en la documentación del dashboard (`/dashboard/elements`).
