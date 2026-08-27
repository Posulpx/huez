import type { Tool, ToolContext } from "./Tool";
import type { Point } from "../engine/types";

/**
 * Drag to pan the canvas viewport. Works in world space and converts the
 * drag delta through the current zoom so the content follows the cursor.
 */
export class PanTool implements Tool {
  readonly id = "pan";
  readonly label = "Pan";
  readonly icon = "✥";
  readonly cursor = "grab";

  private last: Point | null = null;

  onPointerDown(ctx: ToolContext): void {
    this.last = { ...ctx.point };
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.last) return;
    const dx = ctx.point.x - this.last.x;
    const dy = ctx.point.y - this.last.y;
    ctx.renderer.panWorld(dx, dy);
    this.last = { ...ctx.point };
    ctx.requestRender();
  }

  onPointerUp(_ctx: ToolContext): void {
    this.last = null;
  }
}
