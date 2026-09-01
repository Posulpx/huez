import type { Tool, ToolContext } from '../Tool'

/**
 * HistoryTool — undo/redo stack.
 * Provides UI for undo/redo history. The actual history is
 * managed via `src/engine/history.ts` and triggered via
 * Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y (redo)
 * in `src/ui/App.ts`. This tool is a visual placeholder
 * for history navigation.
 */
export class HistoryTool implements Tool {
  readonly id = 'history'
  readonly label = 'History'
  readonly icon = '↺'
  readonly cursor = 'default'
  readonly category: Tool['category'] = 'workspace'

  onPointerDown(ctx: ToolContext): void {
    // Simple: undo on click, redo on Shift+click
    if (ctx.shiftKey) {
      if (ctx.history?.canRedo()) {
        ctx.history.redo()
        ctx.requestRender()
      }
    } else {
      if (ctx.history?.canUndo()) {
        ctx.history.undo()
        ctx.requestRender()
      }
    }
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
