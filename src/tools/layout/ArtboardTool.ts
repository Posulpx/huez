import type { Tool, ToolContext } from '../Tool'
import { ArtboardElement } from '../../elements/ArtboardElement'
import { logApiCall } from '../log'
import { elementProps, recordToolProps, recordToolUsed } from '../records'

/**
 * Drag to draw an Artboard container. Created artboards become clip
 * regions for any element later assigned to them.
 */
export class ArtboardTool implements Tool {
  readonly id = 'artboard'
  readonly label = 'Artboard'
  readonly icon = '◳'
  readonly cursor = 'crosshair'
  readonly category: Tool['category'] = 'workspace'

  private draft: ArtboardElement | null = null

  onPointerDown(ctx: ToolContext): void {
    ctx.history?.push()
    const el = new ArtboardElement(ctx.point.x, ctx.point.y, 0, 0)
    // Number additional artboards: "Artboard 2", "Artboard 3", …
    el.name = `Artboard ${ctx.scene.artboards.length + 1}`
    this.draft = el
    ctx.scene.add(el)
    ctx.scene.select(el)
    recordToolUsed(this.id, this.label)
    logApiCall(`scene.add`, `artboard (${el.id})`)
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.draft || !ctx.start) return
    const x = Math.min(ctx.start.x, ctx.point.x)
    const y = Math.min(ctx.start.y, ctx.point.y)
    let w = Math.abs(ctx.point.x - ctx.start.x)
    let h = Math.abs(ctx.point.y - ctx.start.y)
    if (ctx.shiftKey) {
      const s = Math.max(w, h)
      w = s
      h = s
    }
    this.draft.moveTo(x, y)
    this.draft.width = w
    this.draft.height = h
    ctx.requestRender()
  }

  onPointerUp(ctx: ToolContext): void {
    if (this.draft && (this.draft.width < 2 || this.draft.height < 2)) {
      ctx.scene.remove(this.draft)
    } else if (this.draft) {
      const { shared, specific } = elementProps(this.draft)
      recordToolProps(this.id, this.label, shared, specific)
    }
    this.draft = null
  }
}
