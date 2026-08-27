import { BaseElement } from "../engine/BaseElement";
import type { Bounds, ElementStyle, Point } from "../engine/types";

/**
 * A container "artboard" that renders as a neutral background frame and
 * clips any element assigned to it (`element.artboardId`). Artboards are
 * not clipped themselves and cannot be nested inside other artboards.
 */
export class ArtboardElement extends BaseElement {
  width: number;
  height: number;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: Partial<ElementStyle>
  ) {
    super(x, y, { fill: "#ffffff", stroke: "#c9ced6", strokeWidth: 1, ...style });
    this.name = "Artboard";
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
    const { width: w, height: h } = this;

    // Background fill (the "page"). Use white fallback when fill is null.
    ctx.fillStyle = this.style.fill ?? "#ffffff";
    ctx.fillRect(0, 0, w, h);

    if (this.style.stroke && this.style.strokeWidth > 0) {
      ctx.lineWidth = this.style.strokeWidth;
      ctx.strokeStyle = this.style.stroke;
      ctx.strokeRect(0, 0, w, h);
    }

    // Label sits just above the frame.
    ctx.fillStyle = "#9aa4b2";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(this.name, 2, -4);
  }

  protected hitTestLocal(p: Point): boolean {
    // Width/height may be negative (flipped); normalize the box.
    const w = this.width;
    const h = this.height;
    const x0 = Math.min(0, w);
    const x1 = Math.max(0, w);
    const y0 = Math.min(0, h);
    const y1 = Math.max(0, h);
    if (p.x >= x0 && p.y >= y0 && p.x <= x1 && p.y <= y1) return true;
    // The label band above the frame is a select/move handle too.
    const labelH = 18;
    if (p.y >= -labelH && p.y <= 0 && p.x >= x0 - 2 && p.x <= x1 + 2) return true;
    return false;
  }

  protected cloneSelf(): ArtboardElement {
    return new ArtboardElement(this.x, this.y, this.width, this.height, this.style);
  }
}
