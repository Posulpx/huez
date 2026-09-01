import type { Tool, ToolContext } from '../Tool'

/**
 * LayerTool — hierarchy control, visibility toggles.
 * Provides layer reordering and visibility/lock management.
 * Currently handled via LayerPanel UI; this tool is a placeholder
 * for on-canvas layer interactions (e.g., drag to reorder in viewport).
 */
export class LayerTool implements Tool {
  readonly id = 'layer'
  readonly label = 'Layers'
  readonly icon = '≡'
  readonly cursor = 'default'
  readonly category: Tool['category'] = 'interaction'

  onPointerDown(ctx: ToolContext): void {
    const hit = ctx.scene.hitTest(ctx.point, ctx.renderer.scale)
    if (hit) {
      ctx.scene.select(hit, ctx.shiftKey)
      ctx.requestRender()
    } else {
      ctx.scene.clearSelection()
      ctx.requestRender()
    }
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
