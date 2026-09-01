import type { Tool, ToolContext } from '../Tool'
import { setElementAnchor } from '../../engine/anchor'
import type { AnchorPoint } from '../../engine/types'

/**
 * AlignTool — 9-point element anchors and snapping.
 * Provides alignment of selected elements to artboard anchors and
 * optional snap-to-grid for layout.
 */
export class AlignTool implements Tool {
  readonly id = 'align'
  readonly label = 'Align'
  readonly icon = '⊞'
  readonly cursor = 'default'
  readonly category: Tool['category'] = 'geometry'

  onPointerDown(ctx: ToolContext): void {
    const el = ctx.scene.hitTest(ctx.point, ctx.renderer.scale)
    if (!el || !el.artboardId) return
    // Cycle anchor on click: n -> ne -> e -> se -> s -> sw -> w -> nw -> center -> n
    const order: AnchorPoint[] = [
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'nw',
      'center',
    ]
    const idx = order.indexOf(el.anchor)
    const next = order[(idx + 1) % order.length]!
    ctx.history?.push()
    setElementAnchor(el, next)
    ctx.requestRender()
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
