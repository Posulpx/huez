import type { Tool, ToolContext } from '../Tool'

/**
 * GridTool — guides, rulers, and layout grids.
 * Toggles a visual grid overlay and snap-to-grid for layout.
 */
export class GridTool implements Tool {
  readonly id = 'grid'
  readonly label = 'Grid'
  readonly icon = '▦'
  readonly cursor = 'default'
  readonly category: Tool['category'] = 'geometry'

  private enabled = false

  onPointerDown(ctx: ToolContext): void {
    // Toggle grid overlay on click (stage click)
    this.enabled = !this.enabled
    // Use renderer grid toggle if available; fallback to console
    // GridTool is a placeholder for future guide/ruler implementation
    // For now, just log and request render to show/hide grid
    // The CanvasRenderer already draws a faint grid; this tool could control its visibility
    ctx.requestRender()
  }

  onPointerMove(): void {}
  onPointerUp(): void {}

  isEnabled(): boolean {
    return this.enabled
  }
}
