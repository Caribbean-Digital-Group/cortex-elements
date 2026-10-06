import { describe, expect, it } from 'vitest'
import { faceRegion } from '../src/core/image'
import { FACE_GUIDE } from '../src/ui/camera-capture'

describe('faceRegion', () => {
  it('con prueba de vida conserva el área visible (4:3) de un frame 16:9', () => {
    expect(faceRegion(1920, 1080, FACE_GUIDE, false)).toEqual({ x: 240, y: 0, w: 1440, h: 1080 })
  })

  it('sin prueba de vida recorta al óvalo con margen, centrado', () => {
    const r = faceRegion(1920, 1080, FACE_GUIDE, true)
    expect(r.h).toBe(1080) // 0.78 × 1.4 > 1: no excede el frame
    expect(r.w).toBe(Math.round(0.78 * 1080 * 0.78 * 1.4))
    expect(r.x).toBe(Math.round((1920 - r.w) / 2))
    expect(r.w).toBeLessThan(1440)
  })

  it('frame vertical (celular) usa todo el ancho', () => {
    expect(faceRegion(1080, 1920, FACE_GUIDE, false)).toEqual({ x: 0, y: 555, w: 1080, h: 810 })
  })
})
