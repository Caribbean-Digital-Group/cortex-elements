interface SignatureCanvasOptions {
  /** Called with the PNG blob when the user clicks "Usar firma". */
  onExport: (blob: Blob) => void
}

/**
 * SignatureCanvas — interactive canvas for drawing signatures.
 *
 * - Touch and mouse events supported.
 * - `touch-action: none` set via CSS to prevent scroll interference.
 * - Exported as a PNG Blob (not a data URL) so it can be passed directly to FormData.
 */
export class SignatureCanvas {
  readonly element: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private drawing = false
  private hasStrokes = false
  private lastX = 0
  private lastY = 0

  constructor(private readonly opts: SignatureCanvasOptions) {
    const container = document.createElement('div')
    container.className = 'sig-canvas'

    const canvas = document.createElement('canvas')
    canvas.className = 'sig-canvas__canvas'
    canvas.width = 560
    canvas.height = 180
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'Área de firma')
    this.canvas = canvas

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context not available')
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    this.ctx = ctx

    const controls = document.createElement('div')
    controls.className = 'sig-canvas__controls'

    const clearBtn = this.makeBtn('btn--ghost', 'Limpiar')
    const useBtn = this.makeBtn('btn--primary', 'Usar firma')
    controls.append(clearBtn, useBtn)

    container.append(canvas, controls)
    this.element = container

    // ── Mouse ──────────────────────────────────────────────────────────────

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      const [x, y] = this.clientToCanvas(e.clientX, e.clientY)
      this.beginStroke(x, y)
    })
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const [x, y] = this.clientToCanvas(e.clientX, e.clientY)
      this.continueStroke(x, y)
    })
    canvas.addEventListener('mouseup', () => this.endStroke())
    canvas.addEventListener('mouseleave', () => this.endStroke())

    // ── Touch ──────────────────────────────────────────────────────────────

    canvas.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        e.preventDefault()
        const t = e.touches[0]
        if (!t) return
        const [x, y] = this.clientToCanvas(t.clientX, t.clientY)
        this.beginStroke(x, y)
      },
      { passive: false },
    )

    canvas.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        e.preventDefault()
        const t = e.touches[0]
        if (!t) return
        const [x, y] = this.clientToCanvas(t.clientX, t.clientY)
        this.continueStroke(x, y)
      },
      { passive: false },
    )

    canvas.addEventListener('touchend', () => this.endStroke())
    canvas.addEventListener('touchcancel', () => this.endStroke())

    clearBtn.addEventListener('click', () => this.clear())
    useBtn.addEventListener('click', () => this.exportBlob())
  }

  private makeBtn(cls: string, text: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `btn ${cls}`
    btn.textContent = text
    return btn
  }

  private clientToCanvas(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / r.width
    const scaleY = this.canvas.height / r.height
    return [(clientX - r.left) * scaleX, (clientY - r.top) * scaleY]
  }

  private beginStroke(x: number, y: number): void {
    this.drawing = true
    this.lastX = x
    this.lastY = y
  }

  private continueStroke(x: number, y: number): void {
    if (!this.drawing) return
    this.ctx.beginPath()
    this.ctx.moveTo(this.lastX, this.lastY)
    this.ctx.lineTo(x, y)
    this.ctx.stroke()
    this.lastX = x
    this.lastY = y
    this.hasStrokes = true
  }

  private endStroke(): void {
    this.drawing = false
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.hasStrokes = false
  }

  private exportBlob(): void {
    if (!this.hasStrokes) return
    this.canvas.toBlob(
      (blob) => {
        if (blob) this.opts.onExport(blob)
      },
      'image/png',
    )
  }
}
