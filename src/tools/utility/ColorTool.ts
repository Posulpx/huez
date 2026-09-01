import type { Tool, ToolContext } from '../Tool'

/**
 * ColorTool — fill, stroke, palette management.
 * Eyedropper-style color picking and palette management.
 * Currently handled via PropertiesPanel; this tool provides
 * on-canvas color picking.
 */
export class ColorTool implements Tool {
  readonly id = 'color'
  readonly label = 'Color'
  readonly icon = '🎨'
  readonly cursor = 'crosshair'
  readonly category: Tool['category'] = 'geometry'

  onPointerDown(ctx: ToolContext): void {
    const hit = ctx.scene.hitTest(ctx.point, ctx.renderer.scale)
    if (hit) {
      // Pick fill color from hit element and apply to selection
      const picked = hit.style.fill ?? hit.style.stroke ?? null
      if (picked && ctx.scene.selected.length > 0) {
        ctx.history?.push()
        for (const el of ctx.scene.selected) {
          el.style.fill = picked
        }
        ctx.requestRender()
      }
    }
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
