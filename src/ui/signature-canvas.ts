interface SignatureCanvasOptions {
  /** Se llama con el PNG al terminar cada trazo, o con null al limpiar. */
  onChange: (blob: Blob | null) => void
}

const LOGICAL_W = 560
const LOGICAL_H = 180

/**
 * SignatureCanvas — interactive canvas for drawing signatures.
 *
 * - Pointer Events: mouse, touch y stylus con una sola ruta de código.
 * - Escalado por devicePixelRatio para trazos nítidos en pantallas retina.
 * - Fondo blanco explícito (el backend también tolera PNG transparente).
 * - Exporta automáticamente al terminar cada trazo — sin botón "usar firma".
 */
export class SignatureCanvas {
  readonly element: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly hint: HTMLElement
  private drawing = false
  private hasStrokes = false
  private lastX = 0
  private lastY = 0

  constructor(private readonly opts: SignatureCanvasOptions) {
    const container = document.createElement('div')
    container.className = 'sig-canvas'

    const canvas = document.createElement('canvas')
    canvas.className = 'sig-canvas__canvas'
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = LOGICAL_W * dpr
    canvas.height = LOGICAL_H * dpr
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'Área de firma')
    this.canvas = canvas

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context not available')
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    this.ctx = ctx
    this.paintBackground()

    const hint = document.createElement('p')
    hint.className = 'sig-canvas__hint'
    hint.textContent = 'Firma aquí con el mouse o el dedo'
    this.hint = hint

    const controls = document.createElement('div')
    controls.className = 'sig-canvas__controls'
    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'btn btn--ghost'
    clearBtn.textContent = 'Limpiar'
    controls.append(clearBtn)

    const wrap = document.createElement('div')
    wrap.className = 'sig-canvas__wrap'
    wrap.append(canvas, hint)
    container.append(wrap, controls)
    this.element = container

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      const [x, y] = this.toLogical(e)
      this.drawing = true
      this.lastX = x
      this.lastY = y
      this.hint.hidden = true
    })
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.drawing) return
      const [x, y] = this.toLogical(e)
      this.ctx.beginPath()
      this.ctx.moveTo(this.lastX, this.lastY)
      this.ctx.lineTo(x, y)
      this.ctx.stroke()
      this.lastX = x
      this.lastY = y
      this.hasStrokes = true
    })
    const end = () => {
      if (!this.drawing) return
      this.drawing = false
      this.export()
    }
    canvas.addEventListener('pointerup', end)
    canvas.addEventListener('pointercancel', end)

    clearBtn.addEventListener('click', () => this.clear())
  }

  private paintBackground(): void {
    this.ctx.save()
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
    this.ctx.restore()
  }

  private toLogical(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    return [((e.clientX - r.left) * LOGICAL_W) / r.width, ((e.clientY - r.top) * LOGICAL_H) / r.height]
  }

  private export(): void {
    if (!this.hasStrokes) return
    this.canvas.toBlob((blob) => {
      if (blob) this.opts.onChange(blob)
    }, 'image/png')
  }

  clear(): void {
    this.paintBackground()
    this.hasStrokes = false
    this.hint.hidden = false
    this.opts.onChange(null)
  }
}
