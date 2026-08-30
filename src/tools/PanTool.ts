import type { Tool, ToolContext } from './Tool'
import type { Point } from '../engine/types'

/**
 * Drag to pan the canvas viewport. Uses screen-space delta so the content
 * follows the cursor 1:1 at any zoom level — world-space delta would glitch
 * because `toWorld` depends on the offset that we just mutated.
 */
export class PanTool implements Tool {
  readonly id = 'pan'
  readonly label = 'Pan'
  readonly icon = '✥'
  readonly cursor = 'grab'
  readonly category: Tool['category'] = 'interaction'

  private last: Point | null = null

  onActivate(ctx: ToolContext): void {
    ctx.setCursor(this.cursor)
  }

  onPointerDown(ctx: ToolContext): void {
    this.last = { ...ctx.screenPoint }
    ctx.setCursor('grabbing')
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.last) return
    const dx = ctx.screenPoint.x - this.last.x
    const dy = ctx.screenPoint.y - this.last.y
    if (dx === 0 && dy === 0) return
    ctx.renderer.pan(dx, dy)
    this.last = { ...ctx.screenPoint }
    ctx.requestRender()
  }

  onPointerUp(ctx: ToolContext): void {
    this.last = null
    ctx.setCursor(this.cursor)
  }

  onDeactivate(ctx: ToolContext): void {
    this.last = null
    ctx.setCursor('default')
  }
}
