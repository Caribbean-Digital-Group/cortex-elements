interface CameraCaptureOptions {
  onCapture: (base64: string) => void
  onError: (message: string) => void
}

/**
 * CameraCapture — reusable camera preview + capture UI.
 *
 * Security:
 * - Requests only video (no audio), at a sensible max resolution.
 * - Camera stream is stopped via stop() on element disconnection.
 * - The captured frame is exported as JPEG base64 (pure data, no script).
 * - Error messages are set via textContent downstream — this class only calls onError.
 */
export class CameraCapture {
  readonly element: HTMLElement
  private readonly video: HTMLVideoElement
  private stream: MediaStream | null = null

  private readonly startBtn: HTMLButtonElement
  private readonly captureBtn: HTMLButtonElement
  private readonly stopBtn: HTMLButtonElement

  constructor(private readonly opts: CameraCaptureOptions) {
    const container = document.createElement('div')
    container.className = 'camera'

    const video = document.createElement('video')
    video.className = 'camera__video'
    video.playsInline = true
    video.autoplay = true
    video.muted = true
    video.setAttribute('aria-label', 'Vista previa de la cámara')
    this.video = video

    const controls = document.createElement('div')
    controls.className = 'camera__controls'

    const startBtn = this.makeBtn('btn--secondary', 'Iniciar cámara')
    const captureBtn = this.makeBtn('btn--primary', 'Capturar foto')
    const stopBtn = this.makeBtn('btn--ghost', 'Detener cámara')

    captureBtn.hidden = true
    stopBtn.hidden = true

    this.startBtn = startBtn
    this.captureBtn = captureBtn
    this.stopBtn = stopBtn

    controls.append(startBtn, captureBtn, stopBtn)
    container.append(video, controls)
    this.element = container

    startBtn.addEventListener('click', () => void this.start())
    captureBtn.addEventListener('click', () => this.capture())
    stopBtn.addEventListener('click', () => this.handleStop())
  }

  private makeBtn(cls: string, text: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `btn ${cls}`
    btn.textContent = text
    return btn
  }

  private async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false, // never request audio
      })
      this.video.srcObject = this.stream
      this.startBtn.hidden = true
      this.captureBtn.hidden = false
      this.stopBtn.hidden = false
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Acceso a la cámara denegado'
      this.opts.onError(`Error de cámara: ${msg}`)
    }
  }

  private capture(): void {
    if (!this.stream || this.video.readyState < this.video.HAVE_CURRENT_DATA) return

    const canvas = document.createElement('canvas')
    canvas.width = this.video.videoWidth || 1280
    canvas.height = this.video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(this.video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    // Strip the data: URI prefix — send pure base64 to the backend
    const base64 = dataUrl.split(',')[1] ?? ''
    if (base64) this.opts.onCapture(base64)
  }

  private handleStop(): void {
    this.stop()
    this.startBtn.hidden = false
    this.captureBtn.hidden = true
    this.stopBtn.hidden = true
  }

  /** Must be called when the host element disconnects to release the camera. */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    this.video.srcObject = null
  }
}
