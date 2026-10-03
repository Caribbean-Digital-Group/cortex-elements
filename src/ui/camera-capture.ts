export type CameraFacing = 'user' | 'environment'
export type CameraGuide = 'face' | 'document' | 'none'

interface CameraCaptureOptions {
  onCapture: (base64: string) => void
  onError: (message: string) => void
  /** 'environment' (trasera) para documentos, 'user' (frontal) para selfies. */
  facing?: CameraFacing
  /** Guía visual sobre el video: óvalo para rostro, marco de credencial para documentos. */
  guide?: CameraGuide
  startLabel?: string
}

const MAX_CAPTURE_SIDE = 1920
const JPEG_QUALITY = 0.9

/**
 * CameraCapture — camera preview + capture + photo preview UI.
 *
 * Flow:
 *   [Iniciar cámara] → live video (+ guía) → [Capturar foto]
 *     → stops stream, shows photo preview
 *     → [Repetir] goes back to live view   [Usar foto] calls onCapture
 */
export class CameraCapture {
  readonly element: HTMLElement
  private readonly stage: HTMLElement
  private readonly video: HTMLVideoElement
  private readonly preview: HTMLElement
  private readonly previewImg: HTMLImageElement
  private stream: MediaStream | null = null
  private capturedBase64: string | null = null
  private readonly facing: CameraFacing

  private readonly startBtn: HTMLButtonElement
  private readonly captureBtn: HTMLButtonElement
  private readonly retakeBtn: HTMLButtonElement
  private readonly useBtn: HTMLButtonElement

  constructor(private readonly opts: CameraCaptureOptions) {
    this.facing = opts.facing ?? 'user'

    const container = document.createElement('div')
    container.className = 'camera'

    // ── Live video + guía ─────────────────────────────────────────────────────
    const stage = document.createElement('div')
    stage.className = `camera__stage camera__stage--${opts.guide ?? 'none'}`
    stage.hidden = true
    this.stage = stage

    const video = document.createElement('video')
    video.className = 'camera__video'
    if (this.facing === 'user') video.classList.add('camera__video--mirror')
    video.playsInline = true
    video.autoplay = true
    video.muted = true
    video.setAttribute('aria-label', 'Vista previa de la cámara')
    this.video = video

    const guide = document.createElement('div')
    guide.className = 'camera__guide'
    guide.setAttribute('aria-hidden', 'true')

    const tip = document.createElement('p')
    tip.className = 'camera__tip'
    tip.textContent =
      opts.guide === 'face'
        ? 'Centra tu rostro en el óvalo, con buena luz y sin lentes oscuros'
        : opts.guide === 'document'
          ? 'Coloca el documento dentro del marco, sin reflejos'
          : ''
    tip.hidden = !tip.textContent

    stage.append(video, guide, tip)

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

    this.startBtn = this.makeBtn('btn--secondary', opts.startLabel ?? 'Usar cámara')
    this.captureBtn = this.makeBtn('btn--primary', 'Capturar foto')
    this.retakeBtn = this.makeBtn('btn--ghost', 'Repetir')
    this.useBtn = this.makeBtn('btn--primary', 'Usar foto')

    this.captureBtn.hidden = true
    this.retakeBtn.hidden = true
    this.useBtn.hidden = true

    controls.append(this.startBtn, this.captureBtn, this.retakeBtn, this.useBtn)
    container.append(stage, preview, controls)
    this.element = container

    this.startBtn.addEventListener('click', () => void this.start())
    this.captureBtn.addEventListener('click', () => this.capture())
    this.retakeBtn.addEventListener('click', () => void this.start())
    this.useBtn.addEventListener('click', () => this.use())
  }

  private makeBtn(cls: string, text: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `btn ${cls}`
    btn.textContent = text
    return btn
  }

  // ── States ─────────────────────────────────────────────────────────────────

  private setState(state: 'idle' | 'live' | 'preview'): void {
    this.stage.hidden = state !== 'live'
    this.preview.hidden = state !== 'preview'
    this.startBtn.hidden = state !== 'idle'
    this.captureBtn.hidden = state !== 'live'
    this.retakeBtn.hidden = state !== 'preview'
    this.useBtn.hidden = state !== 'preview'
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async start(): Promise<void> {
    this.capturedBase64 = null
    this.previewImg.removeAttribute('src')
    if (!navigator.mediaDevices?.getUserMedia) {
      this.opts.onError('Este navegador no permite usar la cámara. Sube un archivo en su lugar.')
      return
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      this.video.srcObject = this.stream
      this.setState('live')
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      this.opts.onError(
        denied
          ? 'Permiso de cámara denegado. Habilítalo en tu navegador o sube un archivo.'
          : 'No se pudo iniciar la cámara. Sube un archivo en su lugar.',
      )
      this.setState('idle')
    }
  }

  private capture(): void {
    if (!this.stream || this.video.readyState < this.video.HAVE_CURRENT_DATA) return

    const srcW = this.video.videoWidth || 1280
    const srcH = this.video.videoHeight || 720
    const scale = Math.min(1, MAX_CAPTURE_SIDE / Math.max(srcW, srcH))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(srcW * scale)
    canvas.height = Math.round(srcH * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const base64 = dataUrl.split(',')[1] ?? ''
    if (!base64) return

    // Liberar la cámara de inmediato (apaga el indicador del dispositivo)
    this.stopStream()
    this.capturedBase64 = base64
    this.previewImg.src = dataUrl // data: URI local — sin solicitudes de red
    this.setState('preview')
  }

  private use(): void {
    if (this.capturedBase64) this.opts.onCapture(this.capturedBase64)
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.srcObject = null
  }

  /** Must be called when the host element disconnects to release the camera. */
  stop(): void {
    this.stopStream()
    this.capturedBase64 = null
    this.setState('idle')
  }
}
