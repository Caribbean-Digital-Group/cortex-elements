import { FileDropzone } from './file-dropzone'
import { CameraCapture, type CameraFacing, type CameraGuide } from './camera-capture'
import { base64ToBlob } from '../core/image'

export type CaptureMode = 'upload' | 'camera' | 'both'

interface CaptureSlotOptions {
  title?: string
  mode: CaptureMode
  accept: string
  hint?: string
  facing: CameraFacing
  guide: CameraGuide
  onReady: (blob: Blob) => void
  onError: (message: string) => void
}

/**
 * CaptureSlot — un paso de captura con archivo y/o cámara.
 * Ambas fuentes entregan un Blob para que el element las trate igual.
 */
export class CaptureSlot {
  readonly element: HTMLElement
  private readonly dropzone: FileDropzone | null = null
  private readonly camera: CameraCapture | null = null
  private readonly doneBadge: HTMLElement

  constructor(opts: CaptureSlotOptions) {
    const slot = document.createElement('section')
    slot.className = 'slot'

    if (opts.title) {
      const header = document.createElement('div')
      header.className = 'slot__header'
      const title = document.createElement('span')
      title.className = 'slot__title'
      title.textContent = opts.title
      header.append(title)
      slot.append(header)
    }

    const badge = document.createElement('span')
    badge.className = 'slot__done'
    badge.textContent = '✓ Listo'
    badge.hidden = true
    this.doneBadge = badge
    slot.querySelector('.slot__header')?.append(badge)

    if (opts.mode !== 'camera') {
      this.dropzone = new FileDropzone({
        accept: opts.accept,
        hint: opts.hint,
        onFile: (file) => this.ready(file, opts.onReady),
        onError: opts.onError,
      })
      slot.append(this.dropzone.element)
    }

    if (opts.mode === 'both') {
      const sep = document.createElement('div')
      sep.className = 'separator'
      const span = document.createElement('span')
      span.textContent = 'o'
      sep.append(span)
      slot.append(sep)
    }

    if (opts.mode !== 'upload') {
      this.camera = new CameraCapture({
        facing: opts.facing,
        guide: opts.guide,
        startLabel: opts.facing === 'user' ? 'Tomar selfie' : 'Tomar foto con la cámara',
        onCapture: (base64) => {
          const blob = base64ToBlob(base64)
          this.dropzone?.showSelected(blob, 'Foto de la cámara')
          this.ready(blob, opts.onReady)
        },
        onError: opts.onError,
      })
      slot.append(this.camera.element)
    }

    this.element = slot
  }

  private ready(blob: Blob, cb: (blob: Blob) => void): void {
    this.doneBadge.hidden = false
    this.element.classList.add('slot--done')
    cb(blob)
  }

  /** Enciende la cámara del paso (sin efecto en modo solo archivo). */
  startCamera(): void {
    void this.camera?.start()
  }

  /** Libera la cámara al salir del paso, sin descartar la captura. */
  pauseCamera(): void {
    this.camera?.pause()
  }

  stop(): void {
    this.camera?.stop()
    this.dropzone?.destroy()
  }
}
