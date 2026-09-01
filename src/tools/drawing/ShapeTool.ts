import type { Tool, ToolContext } from '../Tool'
import { ShapeElement } from '../../elements/ShapeElement'
import type { ShapeKind } from '../../engine/types'
import { logApiCall } from '../log'
import { elementProps, recordToolProps, recordToolUsed } from '../records'

/**
 * Draws a dynamic shape by click-dragging from the origin to the
 * opposite corner. Applies a square lock when Shift is held.
 */
export class ShapeTool implements Tool {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly cursor = 'crosshair'
  readonly category: Tool['category'] = 'geometry'

  private draft: ShapeElement | null = null

  constructor(
    private kind: ShapeKind,
    label: string,
    icon: string
  ) {
    this.id = `shape:${kind}`
    this.label = label
    this.icon = icon
  }

  onPointerDown(ctx: ToolContext): void {
    ctx.history?.push()
    const el = new ShapeElement(this.kind, ctx.point.x, ctx.point.y, 0, 0)
    // Auto-assign to the artboard under the creation point, if any.
    const ab = ctx.scene.artboardAtPoint(ctx.point)
    if (ab) {
      el.artboardId = ab.id
      ctx.scene.setActiveArtboard(ab.id)
    }
    this.draft = el
    ctx.scene.add(el)
    ctx.scene.select(el)
    ctx.scene.updateActiveForElement(el)
    recordToolUsed(this.id, this.label)
    logApiCall(`scene.add`, `shape:${this.kind} (${el.id})`)
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.draft || !ctx.start) return
    const sx = ctx.start.x
    const sy = ctx.start.y
    const px = ctx.point.x
    const py = ctx.point.y

    if (this.kind === 'line') {
      let w = px - sx
      let h = py - sy
      if (ctx.shiftKey) {
        const ang = Math.atan2(h, w)
        const len = Math.hypot(w, h)
        const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
        w = Math.cos(snapped) * len
        h = Math.sin(snapped) * len
      }
      // Alt: center pivot for line — keep start as center
      if (ctx.altKey) {
        this.draft.moveTo(sx - w / 2, sy - h / 2)
        this.draft.width = w
        this.draft.height = h
      } else {
        this.draft.moveTo(sx, sy)
        this.draft.width = w
        this.draft.height = h
      }
    } else {
      let x = Math.min(sx, px)
      let y = Math.min(sy, py)
      let w = Math.abs(px - sx)
      let h = Math.abs(py - sy)
      if (ctx.shiftKey) {
        const s = Math.max(w, h)
        w = s
        h = s
        // Keep anchor at start for square lock
        x = sx <= px ? sx : sx - w
        y = sy <= py ? sy : sy - h
      }
      if (ctx.altKey) {
        // Center pivot: keep start as center, anchor stays at center
        const cx = sx
        const cy = sy
        x = cx - w / 2
        y = cy - h / 2
      }
      this.draft.moveTo(x, y)
      this.draft.width = w
      this.draft.height = h
    }
    ctx.requestRender()
  }

  onPointerUp(ctx: ToolContext): void {
    // Discard zero-size accidental clicks (use length so thin/diagonal
    // shapes and lines aren't discarded).
    if (this.draft) {
      const len = Math.hypot(this.draft.width, this.draft.height)
      if (len < 2) {
        ctx.scene.remove(this.draft)
      } else {
        const { shared, specific } = elementProps(this.draft)
        recordToolProps(this.id, this.label, shared, specific)
      }
    }
    this.draft = null
  }
}
