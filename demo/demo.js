/**
 * Shared demo logic — token input + localStorage persistence.
 *
 * Usage:
 *   initDemo({ elementId, onApply })
 *
 *   elementId  — id of the custom element
 *   onApply    — called with the element node once a valid token is set
 */
const STORAGE_KEY = 'cortex_demo_token'

export function initDemo({ elementId, onApply }) {
  const textarea = document.getElementById('token-input')
  const applyBtn = document.getElementById('apply-btn')
  const statusEl = document.getElementById('token-status')
  const wrapper = document.getElementById('element-wrapper')
  const el = document.getElementById(elementId)

  function applyToken(token) {
    if (!token) return
    el.setAttribute('api-key', token)
    wrapper.classList.add('active')
    statusEl.textContent = '✓ Token aplicado'
    statusEl.className = 'token-card__status token-card__status--ok'
    onApply(el)
  }

  // Restore saved token on load
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    textarea.value = saved
    applyToken(saved)
  }

  applyBtn.addEventListener('click', () => {
    const token = textarea.value.trim()
    if (!token) {
      statusEl.textContent = '✗ Ingresa un token para continuar'
      statusEl.className = 'token-card__status token-card__status--err'
      return
    }
    localStorage.setItem(STORAGE_KEY, token)
    applyToken(token)
  })

  // Allow Ctrl+Enter / Cmd+Enter inside the textarea
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      applyBtn.click()
    }
  })
}
