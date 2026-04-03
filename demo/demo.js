/**
 * Shared demo logic — token + api-url inputs with localStorage persistence.
 *
 * Usage:
 *   initDemo({ elementId, onApply })
 *
 *   elementId  — id of the custom element
 *   onApply    — called with the element node once a valid token is set
 */
const KEY_TOKEN = 'cortex_demo_token'
const KEY_URL   = 'cortex_demo_api_url'

export function initDemo({ elementId, onApply }) {
  const textarea  = document.getElementById('token-input')
  const urlInput  = document.getElementById('api-url-input')
  const applyBtn  = document.getElementById('apply-btn')
  const statusEl  = document.getElementById('token-status')
  const wrapper   = document.getElementById('element-wrapper')
  const el        = document.getElementById(elementId)

  function applyConfig(token, apiUrl) {
    el.setAttribute('api-key', token)
    if (apiUrl) {
      el.setAttribute('api-url', apiUrl)
    } else {
      el.removeAttribute('api-url')
    }
    wrapper.classList.add('active')

    const urlLabel = apiUrl ? ` → ${apiUrl}` : ' → producción'
    statusEl.textContent = `✓ Configuración aplicada${urlLabel}`
    statusEl.className = 'token-card__status token-card__status--ok'
    onApply(el)
  }

  // ── Restore saved config on load ──────────────────────────────────────────
  const savedToken = localStorage.getItem(KEY_TOKEN)
  const savedUrl   = localStorage.getItem(KEY_URL) ?? ''

  if (savedToken) textarea.value = savedToken
  if (savedUrl && urlInput) urlInput.value = savedUrl
  if (savedToken) applyConfig(savedToken, savedUrl)

  // ── Apply button ──────────────────────────────────────────────────────────
  applyBtn.addEventListener('click', () => {
    const token  = textarea.value.trim()
    const apiUrl = urlInput?.value.trim() ?? ''

    if (!token) {
      statusEl.textContent = '✗ Ingresa un token para continuar'
      statusEl.className = 'token-card__status token-card__status--err'
      return
    }

    localStorage.setItem(KEY_TOKEN, token)
    if (apiUrl) localStorage.setItem(KEY_URL, apiUrl)
    else        localStorage.removeItem(KEY_URL)

    applyConfig(token, apiUrl)
  })

  // Ctrl/Cmd+Enter submits from the textarea
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      applyBtn.click()
    }
  })
}
