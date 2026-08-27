import type { Tool, ToolContext } from "./Tool";
import { ShapeElement } from "../elements/ShapeElement";
import type { ShapeKind } from "../engine/types";
import { logApiCall } from "./log";
import { elementProps, recordToolProps, recordToolUsed } from "./records";

/**
 * Draws a dynamic shape by click-dragging from the origin to the
 * opposite corner. Applies a square lock when Shift is held.
 */
export class ShapeTool implements Tool {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly cursor = "crosshair";

  private draft: ShapeElement | null = null;

  constructor(
    private kind: ShapeKind,
    label: string,
    icon: string
  ) {
    this.id = `shape:${kind}`;
    this.label = label;
    this.icon = icon;
  }

  onPointerDown(ctx: ToolContext): void {
    const el = new ShapeElement(this.kind, ctx.point.x, ctx.point.y, 0, 0);
    this.draft = el;
    ctx.scene.add(el);
    ctx.scene.select(el);
    recordToolUsed(this.id, this.label);
    logApiCall(`scene.add`, `shape:${this.kind} (${el.id})`);
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.draft || !ctx.start) return;
    const x = Math.min(ctx.start.x, ctx.point.x);
    const y = Math.min(ctx.start.y, ctx.point.y);
    let w = Math.abs(ctx.point.x - ctx.start.x);
    let h = Math.abs(ctx.point.y - ctx.start.y);
    if (ctx.shiftKey) {
      const s = Math.max(w, h);
      w = s;
      h = s;
    }
    this.draft.moveTo(x, y);
    this.draft.width = w;
    this.draft.height = h;
    ctx.requestRender();
  }

  onPointerUp(ctx: ToolContext): void {
    // Discard zero-size accidental clicks.
    if (this.draft && (this.draft.width < 2 || this.draft.height < 2)) {
      ctx.scene.remove(this.draft);
    } else if (this.draft) {
      const { shared, specific } = elementProps(this.draft);
      recordToolProps(this.id, this.label, shared, specific);
    }
    this.draft = null;
  }
}
