import { validateFile, expandAccept, MAX_FILE_SIZE_BYTES } from '../core/validators'

interface DropzoneOptions {
  /** Accept string matching the HTML `accept` attribute format (e.g. "image/*,application/pdf"). */
  accept?: string
  maxBytes?: number
  onFile: (file: File) => void
  onError: (message: string) => void
}

/**
 * FileDropzone — reusable drag-and-drop + click-to-upload UI.
 *
 * Security:
 * - File MIME type is validated against a static allowlist (not arbitrary strings).
 * - File size is validated before any processing.
 * - The displayed filename is set via textContent, never innerHTML.
 * - The hidden <input> accept attribute uses the validated accept string.
 */
export class FileDropzone {
  readonly element: HTMLElement
  private readonly input: HTMLInputElement
  private readonly labelEl: HTMLElement
  private readonly allowedMimes: Set<string>
  private readonly maxBytes: number

  constructor(private readonly opts: DropzoneOptions) {
    this.maxBytes = opts.maxBytes ?? MAX_FILE_SIZE_BYTES
    this.allowedMimes = expandAccept(opts.accept ?? 'image/*,application/pdf')

    const zone = document.createElement('div')
    zone.className = 'dropzone'
    zone.setAttribute('role', 'button')
    zone.setAttribute('tabindex', '0')
    zone.setAttribute('aria-label', 'Arrastra un archivo o haz clic para seleccionar')

    const icon = document.createElement('span')
    icon.className = 'dropzone__icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '📂'

    const label = document.createElement('p')
    label.className = 'dropzone__label'
    label.textContent = 'Arrastra un archivo aquí o haz clic para seleccionar'
    this.labelEl = label

    const hint = document.createElement('p')
    hint.className = 'dropzone__hint'
    hint.textContent = `Máx. ${Math.round(this.maxBytes / 1024 / 1024)} MB`

    // Hidden native input — driven by zone clicks
    const input = document.createElement('input')
    input.type = 'file'
    // accept attribute only allows safe, pre-validated MIME types
    input.accept = opts.accept ?? 'image/*,application/pdf'
    input.hidden = true
    input.setAttribute('aria-hidden', 'true')
    input.setAttribute('tabindex', '-1')
    this.input = input

    zone.append(icon, label, hint, input)
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
    // Show selected filename via textContent (safe, no XSS risk)
    this.labelEl.textContent = file.name
    this.opts.onFile(file)
  }

  reset(): void {
    this.input.value = ''
    this.labelEl.textContent = 'Arrastra un archivo aquí o haz clic para seleccionar'
    this.element.classList.remove('dropzone--over')
  }
}
