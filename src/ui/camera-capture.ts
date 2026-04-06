interface CameraCaptureOptions {
  onCapture: (base64: string) => void
  onError: (message: string) => void
}

/**
 * CameraCapture — camera preview + capture + photo preview UI.
 *
 * Flow:
 *   [Iniciar cámara] → live video → [Capturar foto]
 *     → stops stream, shows photo preview with "Foto capturada" badge
 *     → [Repetir] goes back to live view   [Usar foto] calls onCapture
 */
export class CameraCapture {
  readonly element: HTMLElement
  private readonly video: HTMLVideoElement
  private readonly preview: HTMLElement
  private readonly previewImg: HTMLImageElement
  private readonly controls: HTMLElement
  private stream: MediaStream | null = null
  private capturedBase64: string | null = null

  private readonly startBtn: HTMLButtonElement
  private readonly captureBtn: HTMLButtonElement
  private readonly retakeBtn: HTMLButtonElement
  private readonly useBtn: HTMLButtonElement

  constructor(private readonly opts: CameraCaptureOptions) {
    const container = document.createElement('div')
    container.className = 'camera'

    // ── Live video ────────────────────────────────────────────────────────────
    const video = document.createElement('video')
    video.className = 'camera__video'
    video.playsInline = true
    video.autoplay = true
    video.muted = true
    video.setAttribute('aria-label', 'Vista previa de la cámara')
    this.video = video

    // ── Photo preview (hidden until capture) ──────────────────────────────────
    const preview = document.createElement('div')
    preview.className = 'camera__preview'
    preview.hidden = true
    this.preview = preview

    const previewImg = document.createElement('img')
    previewImg.alt = 'Foto capturada'
    this.previewImg = previewImg

    const badge = document.createElement('span')
    badge.className = 'camera__preview-badge'
    badge.textContent = 'Foto capturada'

    preview.append(previewImg, badge)

    // ── Controls ──────────────────────────────────────────────────────────────
    const controls = document.createElement('div')
    controls.className = 'camera__controls'
    this.controls = controls

    const startBtn  = this.makeBtn('btn--secondary', 'Iniciar cámara')
    const captureBtn = this.makeBtn('btn--primary',  'Capturar foto')
    const retakeBtn = this.makeBtn('btn--ghost',     'Repetir')
    const useBtn    = this.makeBtn('btn--primary',   'Usar foto')

    captureBtn.hidden = true
    retakeBtn.hidden  = true
    useBtn.hidden     = true

    this.startBtn   = startBtn
    this.captureBtn = captureBtn
    this.retakeBtn  = retakeBtn
    this.useBtn     = useBtn

    controls.append(startBtn, captureBtn, retakeBtn, useBtn)
    container.append(video, preview, controls)
    this.element = container

    startBtn.addEventListener('click',   () => void this.start())
    captureBtn.addEventListener('click', () => this.capture())
    retakeBtn.addEventListener('click',  () => void this.retake())
    useBtn.addEventListener('click',     () => this.use())
  }

  private makeBtn(cls: string, text: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `btn ${cls}`
    btn.textContent = text
    return btn
  }

  // ── States ─────────────────────────────────────────────────────────────────

  private showLive(): void {
    this.video.hidden  = false
    this.preview.hidden = true
    this.startBtn.hidden   = true
    this.captureBtn.hidden = false
    this.retakeBtn.hidden  = true
    this.useBtn.hidden     = true
  }

  private showPreview(dataUrl: string): void {
    this.previewImg.src = dataUrl   // src is a local data: URI — safe, no network request
    this.video.hidden   = true
    this.preview.hidden = false
    this.captureBtn.hidden = true
    this.retakeBtn.hidden  = false
    this.useBtn.hidden     = false
  }

  private showIdle(): void {
    this.video.hidden   = false
    this.preview.hidden = true
    this.startBtn.hidden   = false
    this.captureBtn.hidden = true
    this.retakeBtn.hidden  = true
    this.useBtn.hidden     = true
    this.capturedBase64 = null
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      this.video.srcObject = this.stream
      this.showLive()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Acceso a la cámara denegado'
      this.opts.onError(`Error de cámara: ${msg}`)
    }
  }

  private capture(): void {
    if (!this.stream || this.video.readyState < this.video.HAVE_CURRENT_DATA) return

    const canvas = document.createElement('canvas')
    canvas.width  = this.video.videoWidth  || 1280
    canvas.height = this.video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(this.video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const base64  = dataUrl.split(',')[1] ?? ''
    if (!base64) return

    // Stop the stream immediately after capture — frees the camera light
    this.stopStream()
    this.capturedBase64 = base64
    this.showPreview(dataUrl)
  }

  private async retake(): Promise<void> {
    this.capturedBase64 = null
    this.previewImg.src = ''
    // Restart camera
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      this.video.srcObject = this.stream
      this.showLive()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Acceso a la cámara denegado'
      this.opts.onError(`Error de cámara: ${msg}`)
      this.showIdle()
    }
  }

  private use(): void {
    if (this.capturedBase64) {
      this.opts.onCapture(this.capturedBase64)
    }
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    this.video.srcObject = null
  }

  /** Must be called when the host element disconnects to release the camera. */
  stop(): void {
    this.stopStream()
    this.showIdle()
  }
}
