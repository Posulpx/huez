import { BaseElement } from '../engine/BaseElement'
import type { Bounds, ElementStyle, Point } from '../engine/types'

/** A single B├⌐zier anchor. `hIn`/`hOut` are absolute world-space control
 *  handles; `null` means the anchor is a corner (no curvature on that side). */
export interface PathAnchor {
  x: number
  y: number
  hIn: { x: number; y: number } | null
  hOut: { x: number; y: number } | null
}

/**
 * A vector path built from cubic B├⌐zier segments between anchors. Anchor
 * positions and control handles are stored in absolute world coordinates.
 * Supports an open polyline or a closed shape. While `drafting` is true it
 * renders its anchor points, handle arms, and a rubber-band preview to the
 * cursor ΓÇö the classic pen-tool affordance.
 */
export class PathElement extends BaseElement {
  points: PathAnchor[] = []
  closed = false
  drafting = false
  /** When true the path is in vertex-edit mode (double-click). */
  editing = false
  /** Index of the currently selected anchor while editing (-1 = none). */
  editingSelected: number = -1
  /** World-space cursor used for the in-progress rubber-band preview. */
  cursor: Point | null = null
  /** When pen resumes an open path, indicates which end is being continued for preview. */
  resumeEnd: 'start' | 'end' | null = null
  /** When closing a path, the anchor being closed and which handle is being positioned. */
  closingTarget: { index: number; kind: 'hIn' | 'hOut' } | null = null
  /** Cursor position captured during closing mode (cursor is null while closing). */
  closingCursor: Point | null = null
  /** Hover highlight for closing target before click (proximity). */
  closingHover: { index: number; kind: 'hIn' | 'hOut' } | null = null

  constructor(x: number, y: number, style?: Partial<ElementStyle>) {
    super(x, y, { fill: null, stroke: '#1d1d1f', strokeWidth: 2, ...style })
    this.name = 'Path'
  }

  protected get localBounds(): Bounds {
    const b = this.bounds
    return { x: 0, y: 0, width: b.width, height: b.height }
  }

  get bounds(): Bounds {
    // Hug the actual ink: bounds come from the sampled curve, not the control
    // handles (which can extend well beyond the visible path).
    const flat = this.flatten()
    if (flat.length === 0) return { x: this.x, y: this.y, width: 0, height: 0 }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const pt of flat) {
      if (pt.x < minX) minX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  /** Append an anchor at a world point (corner by default). Returns its index. */
  addAnchor(world: Point): number {
    this.points.push({ x: world.x, y: world.y, hIn: null, hOut: null })
    return this.points.length - 1
  }

  /** Set the control handles for an anchor from world-space points. */
  setHandles(
    index: number,
    worldOut: Point | null,
    worldIn: Point | null
  ): void {
    const a = this.points[index]
    if (!a) return
    a.hOut = worldOut ? { x: worldOut.x, y: worldOut.y } : null
    a.hIn = worldIn ? { x: worldIn.x, y: worldIn.y } : null
  }

  /** Move the whole path by shifting every stored world coordinate. */
  override moveTo(x: number, y: number): void {
    const dx = x - this.x
    const dy = y - this.y
    super.moveTo(x, y)
    for (const p of this.points) {
      p.x += dx
      p.y += dy
      if (p.hIn) {
        p.hIn.x += dx
        p.hIn.y += dy
      }
      if (p.hOut) {
        p.hOut.x += dx
        p.hOut.y += dy
      }
    }
    if (this.cursor) {
      this.cursor.x += dx
      this.cursor.y += dy
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return
    const b = this.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, this.style.opacity ?? 1))
    ctx.translate(cx, cy)
    if (this.rotation) ctx.rotate(this.rotation)
    ctx.translate(-cx, -cy)
    this.render(ctx)
    ctx.restore()
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    const pts = this.points
    if (pts.length === 0) return
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = this.style.strokeWidth || 1
    ctx.strokeStyle = this.style.stroke ?? '#1d1d1f'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!
      const cur = pts[i]!
      const c1 = prev.hOut ?? { x: prev.x, y: prev.y }
      const c2 = cur.hIn ?? { x: cur.x, y: cur.y }
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, cur.x, cur.y)
    }
    if (this.closed && pts.length > 1) {
      const last = pts[pts.length - 1]!
      const first = pts[0]!
      let c1 = last.hOut ?? { x: last.x, y: last.y }
      let c2 = first.hIn ?? { x: first.x, y: first.y }
      if (this.closingTarget) {
        if (
          this.closingTarget.index === pts.length - 1 &&
          this.closingTarget.kind === 'hOut' &&
          last.hOut
        ) {
          c1 = { x: 2 * last.x - last.hOut.x, y: 2 * last.y - last.hOut.y }
        } else if (
          this.closingTarget.index === 0 &&
          this.closingTarget.kind === 'hIn' &&
          first.hIn
        ) {
          c2 = { x: 2 * first.x - first.hIn.x, y: 2 * first.y - first.hIn.y }
        }
      }
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, first.x, first.y)
    }
    if (this.closed && this.style.fill) {
      ctx.fillStyle = this.style.fill
      ctx.fill()
    }
    ctx.stroke()

    if (this.drafting) this.renderDraft(ctx)
  }

  /** Anchor squares, handle arms, and a dashed rubber-band to the cursor. */
  private renderDraft(ctx: CanvasRenderingContext2D): void {
    const pts = this.points

    if (this.closingHover && !this.closingTarget) {
      const hover = pts[this.closingHover.index]!
      ctx.save()
      ctx.strokeStyle = '#ff8c00'
      ctx.lineWidth = 1.5
      const cs = 6
      ctx.fillStyle = 'rgba(255, 140, 0, 0.14)'
      ctx.fillRect(hover.x - cs, hover.y - cs, cs * 2, cs * 2)
      ctx.strokeRect(hover.x - cs, hover.y - cs, cs * 2, cs * 2)
      ctx.restore()
    }

    if (this.closingTarget) {
      const target = pts[this.closingTarget.index]!

      // Closing target highlight.
      ctx.save()
      ctx.strokeStyle = '#ff8c00'
      ctx.lineWidth = 2
      const cs = 8
      ctx.fillStyle = 'rgba(255, 140, 0, 0.2)'
      ctx.fillRect(target.x - cs, target.y - cs, cs * 2, cs * 2)
      ctx.strokeRect(target.x - cs, target.y - cs, cs * 2, cs * 2)
      ctx.restore()

      // Construction line: dashed mirror of the handle being built across the anchor.
      const builtHandle =
        this.closingTarget.kind === 'hIn' ? target.hIn : target.hOut
      if (builtHandle) {
        const mirrorX = 2 * target.x - builtHandle.x
        const mirrorY = 2 * target.y - builtHandle.y
        ctx.save()
        ctx.strokeStyle = '#ff8c00'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(target.x, target.y)
        ctx.lineTo(mirrorX, mirrorY)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255, 140, 0, 0.4)'
        ctx.beginPath()
        ctx.arc(mirrorX, mirrorY, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      ctx.save()
      ctx.strokeStyle = '#4f8cff'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      if (this.closingTarget.kind === 'hIn') {
        const cx = this.closingCursor?.x ?? this.cursor?.x ?? target.x
        const cy = this.closingCursor?.y ?? this.cursor?.y ?? target.y
        ctx.moveTo(cx, cy)
        ctx.lineTo(target.x, target.y)
      } else {
        const cx = this.closingCursor?.x ?? this.cursor?.x ?? target.x
        const cy = this.closingCursor?.y ?? this.cursor?.y ?? target.y
        ctx.moveTo(target.x, target.y)
        ctx.lineTo(cx, cy)
      }
      ctx.stroke()
      ctx.restore()
      return
    }

    if (this.cursor && pts.length) {
      ctx.save()
      ctx.strokeStyle = '#4f8cff'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      if (this.resumeEnd === 'start') {
        const first = pts[0]!
        ctx.moveTo(this.cursor.x, this.cursor.y)
        if (first.hIn) {
          const c1 = { x: this.cursor.x, y: this.cursor.y }
          const c2 = first.hIn
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, first.x, first.y)
        } else {
          ctx.lineTo(first.x, first.y)
        }
      } else {
        const last = pts[pts.length - 1]!
        ctx.moveTo(last.x, last.y)
        if (last.hOut) {
          const c1 = last.hOut
          const c2 = { x: this.cursor.x, y: this.cursor.y }
          ctx.bezierCurveTo(
            c1.x,
            c1.y,
            c2.x,
            c2.y,
            this.cursor.x,
            this.cursor.y
          )
        } else {
          ctx.lineTo(this.cursor.x, this.cursor.y)
        }
      }
      ctx.stroke()
      ctx.restore()
    }
    ctx.save()
    ctx.lineWidth = 1
    for (const a of pts) {
      if (a.hOut) {
        ctx.strokeStyle = '#4f8cff'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(a.hOut.x, a.hOut.y)
        ctx.stroke()
        ctx.fillStyle = '#4f8cff'
        ctx.beginPath()
        ctx.arc(a.hOut.x, a.hOut.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      if (a.hIn) {
        ctx.strokeStyle = '#4f8cff'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(a.hIn.x, a.hIn.y)
        ctx.stroke()
        ctx.fillStyle = '#4f8cff'
        ctx.beginPath()
        ctx.arc(a.hIn.x, a.hIn.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#4f8cff'
      ctx.fillRect(a.x - 3, a.y - 3, 6, 6)
      ctx.strokeRect(a.x - 3, a.y - 3, 6, 6)
    }
    ctx.restore()
  }

  override hitTest(p: Point, scale = 1): boolean {
    if (!this.visible) return false
    return this.hitWorld(p, scale)
  }

  protected hitTestLocal(p: Point, scale?: number): boolean {
    const b = this.bounds
    return this.hitWorld({ x: p.x + b.x, y: p.y + b.y }, scale)
  }

  private hitWorld(p: Point, scale?: number): boolean {
    if (this.points.length === 0) return false
    const tol = scale && scale > 0 ? 6 / scale : 6
    const flat = this.flatten()
    for (let i = 0; i < flat.length - 1; i++) {
      if (distToSegment(p, flat[i]!, flat[i + 1]!) <= tol) return true
    }
    // A closed path is also grabbable from anywhere inside its filled area.
    if (this.closed && pointInPolygon(p, flat)) return true
    return false
  }

  /** World <-> stored (unrotated) mapping around the path's rotation center. */
  worldToStored(p: Point): Point {
    if (!this.rotation) return { x: p.x, y: p.y }
    const b = this.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const c = Math.cos(-this.rotation)
    const s = Math.sin(-this.rotation)
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: dx * c - dy * s + cx, y: dx * s + dy * c + cy }
  }

  storedToWorld(p: Point): Point {
    if (!this.rotation) return { x: p.x, y: p.y }
    const b = this.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const c = Math.cos(this.rotation)
    const s = Math.sin(this.rotation)
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: dx * c - dy * s + cx, y: dx * s + dy * c + cy }
  }

  /** Hit-test anchors and handles in visual (rotated) space. */
  hitAnchor(
    p: Point,
    scale = 1
  ): { index: number; kind: 'anchor' | 'hIn' | 'hOut' } | null {
    const tolHandle = scale && scale > 0 ? 6 / scale : 6
    const tolAnchor = scale && scale > 0 ? 8 / scale : 8
    const b = this.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const rot = this.rotation
    const toVisual = (pt: Point): Point => {
      if (!rot) return pt
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      const dx = pt.x - cx
      const dy = pt.y - cy
      return { x: dx * c - dy * s + cx, y: dx * s + dy * c + cy }
    }
    // Handles first (smaller target on top)
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i]!
      if (a.hIn) {
        const vh = toVisual(a.hIn)
        if (Math.hypot(p.x - vh.x, p.y - vh.y) <= tolHandle)
          return { index: i, kind: 'hIn' }
      }
      if (a.hOut) {
        const vh = toVisual(a.hOut)
        if (Math.hypot(p.x - vh.x, p.y - vh.y) <= tolHandle)
          return { index: i, kind: 'hOut' }
      }
    }
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i]!
      const va = toVisual({ x: a.x, y: a.y })
      if (Math.hypot(p.x - va.x, p.y - va.y) <= tolAnchor)
        return { index: i, kind: 'anchor' }
    }
    return null
  }

  /** Find the closest segment (for insertion) and the projected point. */
  closestSegmentInfo(
    p: Point,
    scale = 1
  ): { segmentIndex: number; projected: Point } | null {
    if (this.points.length < 1) return null
    if (this.points.length === 1) return { segmentIndex: 0, projected: p }
    const tol = scale && scale > 0 ? 8 / scale : 8
    const flat = this.flatten()
    const steps = 16
    const b = this.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const rot = this.rotation
    const toVisual = (pt: Point): Point => {
      if (!rot) return pt
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      const dx = pt.x - cx
      const dy = pt.y - cy
      return { x: dx * c - dy * s + cx, y: dx * s + dy * c + cy }
    }
    let bestDist = Infinity
    let bestSeg = 0
    let bestProj: Point = p
    for (let i = 0; i < flat.length - 1; i++) {
      const a = toVisual(flat[i]!)
      const b2 = toVisual(flat[i + 1]!)
      const d = distToSegment(p, a, b2)
      if (d < bestDist) {
        bestDist = d
        bestSeg = Math.floor(i / steps)
        const dx = b2.x - a.x
        const dy = b2.y - a.y
        const len2 = dx * dx + dy * dy
        let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
        t = Math.max(0, Math.min(1, t))
        bestProj = { x: a.x + dx * t, y: a.y + dy * t }
      }
    }
    if (bestDist > tol) return null
    // Clamp to valid gap index
    const maxSeg = this.closed ? this.points.length - 1 : this.points.length - 2
    let seg = Math.max(0, Math.min(bestSeg, maxSeg))
    if (seg < 0) seg = 0
    return { segmentIndex: seg, projected: bestProj }
  }

  /** Insert a new anchor at a visual world point, between segmentIndex segments. */
  insertAnchorAtVisual(world: Point, segmentIndex: number): number {
    const stored = this.worldToStored(world)
    const idx = Math.min(segmentIndex + 1, this.points.length)
    // Insert after `segmentIndex` (so for closing gap push to end)
    if (this.closed && segmentIndex === this.points.length - 1) {
      this.points.push({ x: stored.x, y: stored.y, hIn: null, hOut: null })
      return this.points.length - 1
    }
    this.points.splice(idx, 0, {
      x: stored.x,
      y: stored.y,
      hIn: null,
      hOut: null,
    })
    return idx
  }

  removeAnchor(index: number): void {
    if (index < 0 || index >= this.points.length) return
    this.points.splice(index, 1)
    if (this.editingSelected >= this.points.length) this.editingSelected = -1
    else if (this.editingSelected === index) this.editingSelected = -1
    else if (this.editingSelected > index) this.editingSelected--
  }

  /** Sample the B├⌐zier path into a polyline of world-space points. */
  private flatten(steps = 16): Point[] {
    const pts = this.points
    const out: Point[] = []
    if (pts.length === 0) return out
    const seg = (a: PathAnchor, b: PathAnchor) => {
      const c1 = a.hOut ?? { x: a.x, y: a.y }
      const c2 = b.hIn ?? { x: b.x, y: b.y }
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const mt = 1 - t
        const x =
          mt * mt * mt * a.x +
          3 * mt * mt * t * c1.x +
          3 * mt * t * t * c2.x +
          t * t * t * b.x
        const y =
          mt * mt * mt * a.y +
          3 * mt * mt * t * c1.y +
          3 * mt * t * t * c2.y +
          t * t * t * b.y
        out.push({ x, y })
      }
    }
    out.push({ x: pts[0]!.x, y: pts[0]!.y })
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1]!, pts[i]!)
    if (this.closed && pts.length > 1) seg(pts[pts.length - 1]!, pts[0]!)
    return out
  }

  protected cloneSelf(): PathElement {
    const copy = new PathElement(this.x, this.y, this.style)
    copy.points = this.points.map((p) => ({
      x: p.x,
      y: p.y,
      hIn: p.hIn ? { x: p.hIn.x, y: p.hIn.y } : null,
      hOut: p.hOut ? { x: p.hOut.x, y: p.hOut.y } : null,
    }))
    copy.closed = this.closed
    copy.drafting = false
    copy.cursor = null
    return copy
  }
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

/** Ray-casting point-in-polygon test. */
function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    const intersect =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (intersect) inside = !inside
  }
  return inside
}
