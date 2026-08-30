import type { Tool, ToolContext } from './Tool'
import type { Point } from '../engine/types'
import { PathElement } from '../elements/PathElement'
import { logApiCall } from './log'

/**
 * Pen tool (Illustrator / Figma style). Click to drop corner anchors; click
 * and drag to pull out mirrored Bézier handles for a smooth point. Click the
 * first anchor again to close the path. Press Enter to finish an open path
 * (also finishes when you switch tools), Escape to cancel. The path is added
 * to the scene immediately and committed when the gesture ends.
 */
export class PenTool implements Tool {
  readonly id = 'pen'
  readonly label = 'Pen'
  readonly icon = '∿'
  readonly cursor = 'crosshair'

  private path: PathElement | null = null
  private activeIndex = -1
  private dragging = false
  private dragStart: Point | null = null

  onPointerDown(ctx: ToolContext): void {
    const p = ctx.point

    // Start a new path.
    if (!this.path) {
      const path = new PathElement(p.x, p.y)
      path.drafting = true
      this.activeIndex = path.addAnchor(p)
      ctx.scene.add(path)
      this.path = path
      this.dragging = true
      this.dragStart = p
      path.cursor = p
      ctx.requestRender()
      return
    }

    // Close the path if we click near the first anchor (with >= 2 points).
    const scale = ctx.renderer.scale
    const closeDist = 8 / (scale > 0 ? scale : 1)
    const first = this.path.points[0]!
    const firstWorld = { x: first.x, y: first.y }
    if (this.path.points.length >= 2) {
      const d = Math.hypot(p.x - firstWorld.x, p.y - firstWorld.y)
      if (d <= closeDist) {
        this.path.closed = true
        this.finish(ctx)
        return
      }
    }

    // Otherwise add another anchor.
    this.activeIndex = this.path.addAnchor(p)
    this.dragging = true
    this.dragStart = p
    this.path.cursor = p
    ctx.requestRender()
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.path) return
    this.path.cursor = ctx.point
    if (this.dragging && this.dragStart && this.activeIndex >= 0) {
      const out = { x: ctx.point.x, y: ctx.point.y }
      const inn = {
        x: this.dragStart.x * 2 - ctx.point.x,
        y: this.dragStart.y * 2 - ctx.point.y,
      }
      this.path.setHandles(this.activeIndex, out, inn)
    }
    ctx.requestRender()
  }

  onPointerUp(_ctx: ToolContext): void {
    // A plain click (no drag) leaves the anchor as a corner; a drag already
    // set its handles during the move. The path stays in draft mode either way.
    this.dragging = false
    this.dragStart = null
  }

  onKeyDown(ctx: ToolContext, key: string): void {
    if (key === 'Enter') this.finish(ctx)
    else if (key === 'Escape') this.cancel(ctx)
  }

  onDeactivate(ctx: ToolContext): void {
    if (this.path) {
      if (this.path.points.length >= 2) this.finish(ctx)
      else this.cancel(ctx)
    }
  }

  private finish(ctx: ToolContext): void {
    const path = this.path
    this.reset()
    if (!path) return
    if (path.points.length < 2) {
      ctx.scene.remove(path)
      ctx.requestRender()
      return
    }
    path.drafting = false
    path.cursor = null
    ctx.scene.select(path, false)
    logApiCall('scene.add', `path (${path.points.length} pts)`)
    ctx.requestRender()
  }

  private cancel(ctx: ToolContext): void {
    const path = this.path
    this.reset()
    if (path) ctx.scene.remove(path)
    ctx.requestRender()
  }

  private reset(): void {
    this.path = null
    this.activeIndex = -1
    this.dragging = false
    this.dragStart = null
  }
}
