import { BaseElement } from "../engine/BaseElement";
import type { Bounds, ElementStyle, Point } from "../engine/types";

/** A single Bézier anchor. `hIn`/`hOut` are absolute world-space control
 *  handles; `null` means the anchor is a corner (no curvature on that side). */
export interface PathAnchor {
  x: number;
  y: number;
  hIn: { x: number; y: number } | null;
  hOut: { x: number; y: number } | null;
}

/**
 * A vector path built from cubic Bézier segments between anchors. Anchor
 * positions and control handles are stored in absolute world coordinates.
 * Supports an open polyline or a closed shape. While `drafting` is true it
 * renders its anchor points, handle arms, and a rubber-band preview to the
 * cursor — the classic pen-tool affordance.
 */
export class PathElement extends BaseElement {
  points: PathAnchor[] = [];
  closed = false;
  drafting = false;
  /** World-space cursor used for the in-progress rubber-band preview. */
  cursor: Point | null = null;

  constructor(x: number, y: number, style?: Partial<ElementStyle>) {
    super(x, y, { fill: null, stroke: "#1d1d1f", strokeWidth: 2, ...style });
    this.name = "Path";
  }

  protected get localBounds(): Bounds {
    const b = this.bounds;
    return { x: 0, y: 0, width: b.width, height: b.height };
  }

  get bounds(): Bounds {
    // Hug the actual ink: bounds come from the sampled curve, not the control
    // handles (which can extend well beyond the visible path).
    const flat = this.flatten();
    if (flat.length === 0) return { x: this.x, y: this.y, width: 0, height: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of flat) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /** Append an anchor at a world point (corner by default). Returns its index. */
  addAnchor(world: Point): number {
    this.points.push({ x: world.x, y: world.y, hIn: null, hOut: null });
    return this.points.length - 1;
  }

  /** Set the control handles for an anchor from world-space points. */
  setHandles(index: number, worldOut: Point | null, worldIn: Point | null): void {
    const a = this.points[index];
    if (!a) return;
    a.hOut = worldOut ? { x: worldOut.x, y: worldOut.y } : null;
    a.hIn = worldIn ? { x: worldIn.x, y: worldIn.y } : null;
  }

  /** Move the whole path by shifting every stored world coordinate. */
  override moveTo(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    super.moveTo(x, y);
    for (const p of this.points) {
      p.x += dx;
      p.y += dy;
      if (p.hIn) {
        p.hIn.x += dx;
        p.hIn.y += dy;
      }
      if (p.hOut) {
        p.hOut.x += dx;
        p.hOut.y += dy;
      }
    }
    if (this.cursor) {
      this.cursor.x += dx;
      this.cursor.y += dy;
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    const b = this.bounds;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.style.opacity ?? 1));
    ctx.translate(cx, cy);
    if (this.rotation) ctx.rotate(this.rotation);
    ctx.translate(-cx, -cy);
    this.render(ctx);
    ctx.restore();
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    const pts = this.points;
    if (pts.length === 0) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = this.style.strokeWidth || 1;
    ctx.strokeStyle = this.style.stroke ?? "#1d1d1f";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const cur = pts[i]!;
      const c1 = prev.hOut ?? { x: prev.x, y: prev.y };
      const c2 = cur.hIn ?? { x: cur.x, y: cur.y };
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, cur.x, cur.y);
    }
    if (this.closed && pts.length > 1) {
      const last = pts[pts.length - 1]!;
      const first = pts[0]!;
      const c1 = last.hOut ?? { x: last.x, y: last.y };
      const c2 = first.hIn ?? { x: first.x, y: first.y };
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, first.x, first.y);
    }
    if (this.closed && this.style.fill) {
      ctx.fillStyle = this.style.fill;
      ctx.fill();
    }
    ctx.stroke();

    if (this.drafting) this.renderDraft(ctx);
  }

  /** Anchor squares, handle arms, and a dashed rubber-band to the cursor. */
  private renderDraft(ctx: CanvasRenderingContext2D): void {
    const pts = this.points;
    if (this.cursor && pts.length) {
      const last = pts[pts.length - 1]!;
      ctx.save();
      ctx.strokeStyle = "#4f8cff";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(this.cursor.x, this.cursor.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.lineWidth = 1;
    for (const a of pts) {
      if (a.hOut) {
        ctx.strokeStyle = "#4f8cff";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.hOut.x, a.hOut.y);
        ctx.stroke();
        ctx.fillStyle = "#4f8cff";
        ctx.beginPath();
        ctx.arc(a.hOut.x, a.hOut.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (a.hIn) {
        ctx.strokeStyle = "#4f8cff";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.hIn.x, a.hIn.y);
        ctx.stroke();
        ctx.fillStyle = "#4f8cff";
        ctx.beginPath();
        ctx.arc(a.hIn.x, a.hIn.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#4f8cff";
      ctx.fillRect(a.x - 3, a.y - 3, 6, 6);
      ctx.strokeRect(a.x - 3, a.y - 3, 6, 6);
    }
    ctx.restore();
  }

  override hitTest(p: Point, scale = 1): boolean {
    if (!this.visible) return false;
    return this.hitWorld(p, scale);
  }

  protected hitTestLocal(p: Point, scale?: number): boolean {
    const b = this.bounds;
    return this.hitWorld({ x: p.x + b.x, y: p.y + b.y }, scale);
  }

  private hitWorld(p: Point, scale?: number): boolean {
    if (this.points.length === 0) return false;
    const tol = scale && scale > 0 ? 6 / scale : 6;
    const flat = this.flatten();
    for (let i = 0; i < flat.length - 1; i++) {
      if (distToSegment(p, flat[i]!, flat[i + 1]!) <= tol) return true;
    }
    // A closed path is also grabbable from anywhere inside its filled area.
    if (this.closed && pointInPolygon(p, flat)) return true;
    return false;
  }

  /** Sample the Bézier path into a polyline of world-space points. */
  private flatten(steps = 16): Point[] {
    const pts = this.points;
    const out: Point[] = [];
    if (pts.length === 0) return out;
    const seg = (a: PathAnchor, b: PathAnchor) => {
      const c1 = a.hOut ?? { x: a.x, y: a.y };
      const c2 = b.hIn ?? { x: b.x, y: b.y };
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const x =
          mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x;
        const y =
          mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y;
        out.push({ x, y });
      }
    };
    out.push({ x: pts[0]!.x, y: pts[0]!.y });
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1]!, pts[i]!);
    if (this.closed && pts.length > 1) seg(pts[pts.length - 1]!, pts[0]!);
    return out;
  }

  protected cloneSelf(): PathElement {
    const copy = new PathElement(this.x, this.y, this.style);
    copy.points = this.points.map((p) => ({
      x: p.x,
      y: p.y,
      hIn: p.hIn ? { x: p.hIn.x, y: p.hIn.y } : null,
      hOut: p.hOut ? { x: p.hOut.x, y: p.hOut.y } : null
    }));
    copy.closed = this.closed;
    copy.drafting = false;
    copy.cursor = null;
    return copy;
  }
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Ray-casting point-in-polygon test. */
function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}
