import type { BaseElement } from './BaseElement'
import type { Point } from './types'

/**
 * Geometry + hit-testing for on-canvas transform controls (scale handles
 * and a rotate handle). Works in the element's unrotated local frame and
 * maps to world space through the element's center-based rotation, so the
 * handles stay glued to the element no matter how it is rotated.
 */

export type HandleId =
  'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export const HANDLE_HIT_RADIUS = 8
export const ROTATE_OFFSET = 28

export function rectOf(el: BaseElement): Rect {
  const b = el.bounds
  return { x: b.x, y: b.y, w: b.width, h: b.height, rotation: el.rotation }
}

/** Local-space point (origin at element top-left) -> world. */
export function worldPointRect(r: Rect, lx: number, ly: number): Point {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  let dx = lx - r.w / 2
  let dy = ly - r.h / 2
  if (r.rotation) {
    const c = Math.cos(r.rotation)
    const s = Math.sin(r.rotation)
    const rx = dx * c - dy * s
    const ry = dx * s + dy * c
    dx = rx
    dy = ry
  }
  return { x: dx + cx, y: dy + cy }
}

/** World point -> element's unrotated local frame. */
export function localPointRect(r: Rect, p: Point): Point {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  let dx = p.x - cx
  let dy = p.y - cy
  if (r.rotation) {
    const c = Math.cos(-r.rotation)
    const s = Math.sin(-r.rotation)
    const rx = dx * c - dy * s
    const ry = dx * s + dy * c
    dx = rx
    dy = ry
  }
  return { x: dx + r.w / 2, y: dy + r.h / 2 }
}

export function worldPoint(el: BaseElement, lx: number, ly: number): Point {
  return worldPointRect(rectOf(el), lx, ly)
}

export function localPoint(el: BaseElement, p: Point): Point {
  return localPointRect(rectOf(el), p)
}

/** Local-space anchor for every handle (including the rotate handle). */
function localHandlePoints(r: Rect): { id: HandleId; x: number; y: number }[] {
  const { w, h } = r
  return [
    { id: 'nw', x: 0, y: 0 },
    { id: 'n', x: w / 2, y: 0 },
    { id: 'ne', x: w, y: 0 },
    { id: 'e', x: w, y: h / 2 },
    { id: 'se', x: w, y: h },
    { id: 's', x: w / 2, y: h },
    { id: 'sw', x: 0, y: h },
    { id: 'w', x: 0, y: h / 2 },
    { id: 'rotate', x: w / 2, y: -ROTATE_OFFSET },
  ]
}

export function handlePoints(
  el: BaseElement
): { id: HandleId; x: number; y: number }[] {
  const r = rectOf(el)
  return localHandlePoints(r).map((h) => ({
    id: h.id,
    ...worldPointRect(r, h.x, h.y),
  }))
}

export function hitHandle(el: BaseElement, p: Point): HandleId | null {
  for (const h of handlePoints(el)) {
    const dx = p.x - h.x
    const dy = p.y - h.y
    if (dx * dx + dy * dy <= HANDLE_HIT_RADIUS * HANDLE_HIT_RADIUS) return h.id
  }
  return null
}

/** Which edges a scale handle controls. */
export function handleEdges(id: HandleId): {
  west: boolean
  east: boolean
  north: boolean
  south: boolean
} {
  return {
    west: id === 'nw' || id === 'w' || id === 'sw',
    east: id === 'ne' || id === 'e' || id === 'se',
    north: id === 'nw' || id === 'n' || id === 'ne',
    south: id === 'sw' || id === 's' || id === 'se',
  }
}
