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

  protected hitTestLocal(p: Point, scale?: number): boolean {
    // Only the label band and the border edges are interactive — the interior
    // is intentionally NOT a hit target, so dragging empty artboard space
    // never moves the board (children are hit-tested first anyway).
    return this.hitLabel(p, scale) || this.hitEdge(p, scale);
  }

  /** Factor that inflates handle hit areas as the viewport zooms out, so the
   *  label band and edges stay a roughly constant size on screen. At zoom ≥ 1
   *  (or unknown scale) it's 1 (no inflation). */
  private handleScale(scale: number | undefined): number {
    if (!scale || scale <= 0) return 1;
    return Math.max(1, 1 / scale);
  }

  /** True if a WORLD-space point lands on this artboard's border edge (a thin
   *  strip around the frame, inside or just outside it). Evaluated in the
   *  artboard's rotated local frame. The label band is handled separately. */
  hitEdge(p: Point, scale?: number): boolean {
    const w = this.width;
    const h = this.height;
    const cx = this.x + w / 2;
    const cy = this.y + h / 2;
    const c = Math.cos(-this.rotation);
    const s = Math.sin(-this.rotation);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const localX = lx + w / 2;
    const localY = ly + h / 2;
    const x0 = Math.min(0, w);
    const x1 = Math.max(0, w);
    const y0 = Math.min(0, h);
    const y1 = Math.max(0, h);
    const EDGE = 6 * this.handleScale(scale);
    if (localX < x0 - EDGE || localX > x1 + EDGE) return false;
    if (localY < y0 - EDGE || localY > y1 + EDGE) return false;
    const nearX = localX <= x0 + EDGE || localX >= x1 - EDGE;
    const nearY = localY <= y0 + EDGE || localY >= y1 - EDGE;
    return nearX || nearY;
  }

  /** True if a WORLD-space point lands on this artboard's label band (the
   *  strip rendered just above the frame). Tested in the artboard's rotated
   *  local frame so it stays accurate under rotation. Clicking the label is
   *  always prioritised over child elements. */
  hitLabel(p: Point, scale?: number): boolean {
    const w = this.width;
    const h = this.height;
    const cx = this.x + w / 2;
    const cy = this.y + h / 2;
    const c = Math.cos(-this.rotation);
    const s = Math.sin(-this.rotation);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const localX = lx + w / 2;
    const localY = ly + h / 2;
    const f = this.handleScale(scale);
    const x0 = Math.min(0, w) - 2 * f;
    const x1 = Math.max(0, w) + 2 * f;
    const labelH = 18 * f;
    return localX >= x0 && localX <= x1 && localY >= -labelH && localY <= 0;
  }

  protected cloneSelf(): ArtboardElement {
    return new ArtboardElement(this.x, this.y, this.width, this.height, this.style);
  }
}
