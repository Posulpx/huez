import { ShapeElement } from '../elements/ShapeElement'
import { PathElement } from '../elements/PathElement'
import type { Point } from './types'

const KAPPA = 0.5522847498307936

/**
 * Convert a primitive ShapeElement (rectangle / ellipse / line) into an
 * equivalent PathElement with absolute world points. Rotation and style are
 * preserved — the path's points are created in unrotated world space (shape.x+lx, shape.y+ly)
 * and the path's rotation is set to the shape's rotation, so the draw-time
 * rotate-around-center matches the original shape.
 */
export function shapeToPath(shape: ShapeElement): PathElement {
  const path = new PathElement(shape.x, shape.y, { ...shape.style })
  path.rotation = shape.rotation
  path.artboardId = shape.artboardId
  path.visible = shape.visible
  path.locked = shape.locked
  path.name = `${shape.name} Path`
  // Preserve anchor if needed (artboard relative)
  ;(path as unknown as { anchor: unknown }).anchor = (
    shape as unknown as { anchor: unknown }
  ).anchor

  const w = shape.width
  const h = shape.height
  const sx = shape.x
  const sy = shape.y

  // Helper: local (lx,ly) in shape's unrotated local space -> absolute world before rotation
  // Path will be rotated at draw time, so store unrotated positions.
  const at = (lx: number, ly: number): Point => ({ x: sx + lx, y: sy + ly })

  if (shape.kind === 'rectangle') {
    // 4 corners, sharp (no handles), closed
    const p0 = at(0, 0)
    const p1 = at(w, 0)
    const p2 = at(w, h)
    const p3 = at(0, h)
    path.points = [
      { x: p0.x, y: p0.y, hIn: null, hOut: null },
      { x: p1.x, y: p1.y, hIn: null, hOut: null },
      { x: p2.x, y: p2.y, hIn: null, hOut: null },
      { x: p3.x, y: p3.y, hIn: null, hOut: null },
    ]
    path.closed = true
  } else if (shape.kind === 'line') {
    const p0 = at(0, 0)
    const p1 = at(w, h)
    path.points = [
      { x: p0.x, y: p0.y, hIn: null, hOut: null },
      { x: p1.x, y: p1.y, hIn: null, hOut: null },
    ]
    path.closed = false
  } else if (shape.kind === 'ellipse') {
    // 4-point bezier ellipse, closed, smooth handles
    // Center in unrotated world: (sx + w/2, sy + h/2)
    const cx = sx + w / 2
    const cy = sy + h / 2
    const rx = w / 2
    const ry = h / 2
    const kx = KAPPA * rx
    const ky = KAPPA * ry

    // Points at cardinal directions in unrotated space
    const top: Point = { x: cx, y: cy - ry }
    const right: Point = { x: cx + rx, y: cy }
    const bottom: Point = { x: cx, y: cy + ry }
    const left: Point = { x: cx - rx, y: cy }

    path.points = [
      {
        x: top.x,
        y: top.y,
        hIn: { x: top.x - kx, y: top.y },
        hOut: { x: top.x + kx, y: top.y },
      },
      {
        x: right.x,
        y: right.y,
        hIn: { x: right.x, y: right.y - ky },
        hOut: { x: right.x, y: right.y + ky },
      },
      {
        x: bottom.x,
        y: bottom.y,
        hIn: { x: bottom.x + kx, y: bottom.y },
        hOut: { x: bottom.x - kx, y: bottom.y },
      },
      {
        x: left.x,
        y: left.y,
        hIn: { x: left.x, y: left.y + ky },
        hOut: { x: left.x, y: left.y - ky },
      },
    ]
    path.closed = true
  }

  // Ensure path's x/y matches shape's origin for moveTo semantics
  path.moveTo(shape.x, shape.y)
  // moveTo shifts points, but we already created points at absolute positions including shape.x/y,
  // so we need to undo that shift: moveTo added dx/dy from (shape.x,shape.y) to same, so no shift if path.x was shape.x.
  // Actually PathElement constructor set x,y to shape.x,shape.y, and points are at sx+lx etc, which are already absolute.
  // moveTo(shape.x,shape.y) will compute dx=0 and not shift. So safe.
  // To be safe, reset x,y to shape's x,y without shifting points if needed.
  // Our points are already absolute, so ensure path.x/y = shape.x/y without extra shift.
  // The above moveTo does nothing (dx 0), so fine.

  return path
}
