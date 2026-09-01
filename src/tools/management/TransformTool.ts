import type { Tool, ToolContext } from '../Tool'

/**
 * TransformTool — scale, rotate, skew as one.
 * Dedicated transform tool that operates on the current selection's
 * group bounds. Reuses SelectTool's group transform logic via the
 * shared TransformHandles, but as a standalone tool for explicit
 * transform mode.
 *
 * For now, this is a thin wrapper that delegates to SelectTool's
 * group transform when active. Full implementation can be extracted
 * from SelectTool's scale/rotate handling.
 */
export class TransformTool implements Tool {
  readonly id = 'transform'
  readonly label = 'Transform'
  readonly icon = '⤢'
  readonly cursor = 'default'
  readonly category: Tool['category'] = 'interaction'

  onPointerDown(ctx: ToolContext): void {
    // Delegate to SelectTool's group transform if multiple selected
    // For now, just select and let SelectTool handle the transform
    // This tool is a placeholder for a dedicated transform mode
    const target = ctx.scene.hitTest(ctx.point, ctx.renderer.scale)
    if (target && !ctx.scene.isSelected(target)) {
      ctx.scene.select(target, ctx.shiftKey)
    }
    ctx.requestRender()
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
