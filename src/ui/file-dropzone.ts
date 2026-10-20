import { validateFile, expandAccept, effectiveMime, MAX_FILE_SIZE_BYTES } from '../core/validators'

interface DropzoneOptions {
  /** Accept string matching the HTML `accept` attribute format (e.g. "image/*,application/pdf"). */
  accept?: string
  maxBytes?: number
  /** Texto principal de la zona. */
  label?: string
  /** Texto secundario (formatos aceptados). */
  hint?: string
  onFile: (file: File) => void
  onError: (message: string) => void
}

const DEFAULT_LABEL = 'Arrastra un archivo aquí o haz clic para seleccionar'

/**
 * FileDropzone — reusable drag-and-drop + click-to-upload UI with image preview.
 *
 * Security:
 * - File MIME type is validated against a static allowlist (not arbitrary strings).
 * - File size is validated before any processing.
 * - The displayed filename is set via textContent, never innerHTML.
 * - Previews use local object URLs (no network) and are revoked when replaced.
 */
export class FileDropzone {
  readonly element: HTMLElement
  private readonly input: HTMLInputElement
  private readonly labelEl: HTMLElement
  private readonly previewEl: HTMLImageElement
  private readonly iconEl: HTMLElement
  private readonly allowedMimes: Set<string>
  private readonly maxBytes: number
  private readonly defaultLabel: string
  private previewUrl: string | null = null

  constructor(private readonly opts: DropzoneOptions) {
    this.maxBytes = opts.maxBytes ?? MAX_FILE_SIZE_BYTES
    this.allowedMimes = expandAccept(opts.accept ?? 'image/*,application/pdf')
    this.defaultLabel = opts.label ?? DEFAULT_LABEL

    const zone = document.createElement('div')
    zone.className = 'dropzone'
    zone.setAttribute('role', 'button')
    zone.setAttribute('tabindex', '0')
    zone.setAttribute('aria-label', this.defaultLabel)

    const icon = document.createElement('span')
    icon.className = 'dropzone__icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '⬆'
    this.iconEl = icon

    const preview = document.createElement('img')
    preview.className = 'dropzone__preview'
    preview.alt = 'Vista previa'
    preview.hidden = true
    this.previewEl = preview

    const label = document.createElement('p')
    label.className = 'dropzone__label'
    label.textContent = this.defaultLabel
    this.labelEl = label

    const hint = document.createElement('p')
    hint.className = 'dropzone__hint'
    hint.textContent = opts.hint ?? `Máx. ${Math.round(this.maxBytes / 1024 / 1024)} MB`

    // Hidden native input — driven by zone clicks
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = opts.accept ?? 'image/*,application/pdf'
    input.hidden = true
    input.setAttribute('aria-hidden', 'true')
    input.setAttribute('tabindex', '-1')
    this.input = input

    zone.append(icon, preview, label, hint, input)
    this.element = zone

    // ── Event listeners ─────────────────────────────────────────────────────

    zone.addEventListener('click', () => input.click())

    zone.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        input.click()
      }
    })

    zone.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault()
      zone.classList.add('dropzone--over')
    })

    zone.addEventListener('dragleave', () => zone.classList.remove('dropzone--over'))

    zone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault()
      zone.classList.remove('dropzone--over')
      const file = e.dataTransfer?.files[0]
      if (file) this.processFile(file)
    })

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (file) this.processFile(file)
      // Reset so the same file can be re-selected after an error
      input.value = ''
    })
  }

  private processFile(file: File): void {
    const err = validateFile(file, this.allowedMimes, this.maxBytes)
    if (err) {
      this.opts.onError(err)
      return
    }
    this.showSelected(file)
    this.opts.onFile(file)
  }

  /** Muestra miniatura (imágenes) o el nombre del archivo (PDF/XML). */
  showSelected(file: Blob, name?: string): void {
    this.revokePreview()
    const isImage = (file instanceof File ? effectiveMime(file) : file.type).startsWith('image/')
    if (isImage) {
      this.previewUrl = URL.createObjectURL(file)
      this.previewEl.src = this.previewUrl
    }
    this.previewEl.hidden = !isImage
    this.iconEl.hidden = isImage
    this.labelEl.textContent = name ?? (file instanceof File ? file.name : 'Imagen capturada')
    this.element.classList.add('dropzone--filled')
  }

  private revokePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
    this.previewUrl = null
  }

  reset(): void {
    this.revokePreview()
    this.input.value = ''
    this.previewEl.hidden = true
    this.previewEl.removeAttribute('src')
    this.iconEl.hidden = false
    this.labelEl.textContent = this.defaultLabel
    this.element.classList.remove('dropzone--over', 'dropzone--filled')
  }

  destroy(): void {
    this.revokePreview()
  }
}
