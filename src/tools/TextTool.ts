import type { Tool, ToolContext } from './Tool'
import { TextElement } from '../elements/TextElement'
import { logApiCall } from './log'
import { elementProps, recordToolProps, recordToolUsed } from './records'

/**
 * Places a new text element where the user clicks, then selects it so
 * the properties panel can immediately edit the content.
 */
export class TextTool implements Tool {
  readonly id = 'text'
  readonly label = 'Text'
  readonly icon = 'T'
  readonly cursor = 'text'

  onPointerDown(ctx: ToolContext): void {
    const el = new TextElement(ctx.point.x, ctx.point.y, { text: 'Text' })
    // Auto-assign to the artboard under the creation point, if any.
    const ab = ctx.scene.artboardAtPoint(ctx.point)
    if (ab) el.artboardId = ab.id
    ctx.scene.add(el)
    ctx.scene.select(el)
    recordToolUsed(this.id, this.label)
    const { shared, specific } = elementProps(el)
    recordToolProps(this.id, this.label, shared, specific)
    logApiCall(`scene.add`, `text (${el.id})`)
    ctx.requestRender()
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
