import { BaseElement } from "../engine/BaseElement";
import type { Bounds, ElementStyle, Point, ShapeKind } from "../engine/types";

/**
 * Dynamic shape element (rectangle, ellipse, line). Geometry is defined
 * in local space from the origin (0,0) by `width`/`height`, then placed
 * at (x,y) with optional rotation by the base class.
 */
export class ShapeElement extends BaseElement {
  kind: ShapeKind;
  width: number;
  height: number;

  constructor(
    kind: ShapeKind,
    x: number,
    y: number,
    width: number,
    height: number,
    style?: Partial<ElementStyle>
  ) {
    super(x, y, style);
    this.name = kind.charAt(0).toUpperCase() + kind.slice(1);
    this.kind = kind;
    this.width = width;
    this.height = height;
  }

  protected get localBounds(): Bounds {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  get bounds(): Bounds {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    this.tracePath(ctx);

    if (this.style.fill) {
      ctx.fillStyle = this.style.fill;
      ctx.fill();
    }
    if (this.style.stroke && this.style.strokeWidth > 0) {
      ctx.lineWidth = this.style.strokeWidth;
      ctx.strokeStyle = this.style.stroke;
      ctx.stroke();
    }
  }

  private tracePath(ctx: CanvasRenderingContext2D): void {
    const { width: w, height: h, kind } = this;
    ctx.beginPath();
    switch (kind) {
      case "rectangle":
        ctx.rect(0, 0, w, h);
        break;
      case "ellipse":
        ctx.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        break;
      case "line":
        ctx.moveTo(0, 0);
        ctx.lineTo(w, h);
        break;
    }
  }

  protected hitTestLocal(p: Point): boolean {
    const { width: w, height: h, kind } = this;
    // Width/height may be negative (a flipped element); normalize the box.
    const x0 = Math.min(0, w);
    const x1 = Math.max(0, w);
    const y0 = Math.min(0, h);
    const y1 = Math.max(0, h);
    switch (kind) {
      case "rectangle":
      case "ellipse": {
        if (p.x < x0 || p.y < y0 || p.x > x1 || p.y > y1) return false;
        if (kind === "rectangle") return true;
        const rx = w / 2;
        const ry = h / 2;
        const cx = p.x - rx;
        const cy = p.y - ry;
        return (cx * cx) / (rx * rx) + (cy * cy) / (ry * ry) <= 1;
      }
      case "line": {
        // Distance from point to the line segment.
        const dx = w;
        const dy = h;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((p.x) * dx + (p.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = dx * t;
        const py = dy * t;
        const dist = Math.hypot(p.x - px, p.y - py);
        return dist <= Math.max(this.style.strokeWidth, 6);
      }
    }
  }

  protected cloneSelf(): ShapeElement {
    return new ShapeElement(this.kind, this.x, this.y, this.width, this.height, this.style);
  }
}
