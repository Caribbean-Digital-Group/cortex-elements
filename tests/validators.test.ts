import { describe, expect, it } from 'vitest'
import { effectiveMime, expandAccept, validateApiKey, validateApiUrl } from '../src/core/validators'

describe('validators', () => {
  it('acepta tokens opacos y JWT legados', () => {
    expect(validateApiKey('ck_live_' + 'a'.repeat(43))).toBe(true)
    expect(validateApiKey('eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl')).toBe(true)
    expect(validateApiKey('corto')).toBe(false)
    expect(validateApiKey('<script>')).toBe(false)
  })

  it('exige HTTPS salvo localhost', () => {
    expect(validateApiUrl('https://api.cortexverify.com')).toBe(true)
    expect(validateApiUrl('http://localhost:8000')).toBe(true)
    expect(validateApiUrl('http://api.evil.com')).toBe(false)
    expect(validateApiUrl('javascript:alert(1)')).toBe(false)
  })

  it('expande accept incluyendo XML para CFDI', () => {
    const mimes = expandAccept('image/*,application/pdf,.xml')
    expect(mimes.has('image/png')).toBe(true)
    expect(mimes.has('application/pdf')).toBe(true)
    expect(mimes.has('text/xml')).toBe(true)
  })

  it('infiere MIME de .xml cuando el navegador no lo reporta', () => {
    expect(effectiveMime(new File(['<x/>'], 'factura.XML', { type: '' }))).toBe('application/xml')
    expect(effectiveMime(new File(['x'], 'foto.png', { type: 'image/png' }))).toBe('image/png')
  })
})
