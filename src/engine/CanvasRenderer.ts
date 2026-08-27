import type { BaseElement } from "./BaseElement";
import type { Scene } from "./Scene";
import { ArtboardElement } from "../elements/ArtboardElement";
import { handlePoints, HANDLE_HIT_RADIUS } from "./TransformHandles";

/**
 * Renders a Scene to a Canvas 2D context with proper device-pixel-ratio
 * scaling. Knows nothing about tools or UI — it only paints elements.
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  /** Viewport: world -> screen is `screen = world * scale + offset` (CSS px). */
  scale = 1;
  offsetX = 0;
  offsetY = 0;

  private static readonly MIN_SCALE = 0.1;
  private static readonly MAX_SCALE = 8;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.resize();
  }

  /** Match the backing store to the CSS size * devicePixelRatio. */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
  }

  get width(): number {
    return this.canvas.width / this.dpr;
  }

  get height(): number {
    return this.canvas.height / this.dpr;
  }

  /** Reset pan/zoom to the default identity view. */
  resetView(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /** Pan by a delta in screen (CSS) pixels. */
  pan(dxScreen: number, dyScreen: number): void {
    this.offsetX += dxScreen;
    this.offsetY += dyScreen;
  }

  /** Pan by a delta expressed in world units (used by world-space tools). */
  panWorld(dxWorld: number, dyWorld: number): void {
    this.offsetX += dxWorld * this.scale;
    this.offsetY += dyWorld * this.scale;
  }

  /** Zoom by `factor`, keeping the world point under (clientX, clientY) fixed. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const next = clamp(this.scale * factor, CanvasRenderer.MIN_SCALE, CanvasRenderer.MAX_SCALE);
    if (next === this.scale) return;
    // World point currently under the cursor.
    const wx = (sx - this.offsetX) / this.scale;
    const wy = (sy - this.offsetY) / this.scale;
    // Re-anchor so that world point stays under the cursor.
    this.offsetX = sx - wx * next;
    this.offsetY = sy - wy * next;
    this.scale = next;
  }

  render(scene: Scene): void {
    const { ctx, dpr } = this;
    // Clear the full backing store (identity transform) before applying view.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.offsetX, dpr * this.offsetY);

    // 1) Artboards render first as backgrounds (in their own z-order).
    for (const el of scene.artboards) el.draw(ctx);

    // 2) Everything else, clipped to its assigned artboard if any.
    for (const el of scene.all) {
      if (el instanceof ArtboardElement) continue;

      const artboard = el.artboardId
        ? (scene.getElementById(el.artboardId) as ArtboardElement | undefined)
        : undefined;

      if (artboard instanceof ArtboardElement) {
        ctx.save();
        ctx.beginPath();
        const ax = Math.min(artboard.x, artboard.x + artboard.width);
        const ay = Math.min(artboard.y, artboard.y + artboard.height);
        ctx.rect(ax, ay, Math.abs(artboard.width), Math.abs(artboard.height));
        ctx.clip();
        el.draw(ctx);
        ctx.restore();
      } else {
        el.draw(ctx);
      }
    }

    // 3) Selection overlays are never clipped — bounds/handles stay visible.
    this.drawSelectionOverlay(scene);
  }

  private drawSelectionOverlay(scene: Scene): void {
    const { ctx } = this;
    ctx.save();
    for (const el of scene.selected) {
      const b = el.bounds;

      // Rotated bounding outline.
      const corners = [
        this.worldCorner(el, 0, 0),
        this.worldCorner(el, b.width, 0),
        this.worldCorner(el, b.width, b.height),
        this.worldCorner(el, 0, b.height)
      ];
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#4f8cff";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(corners[0]!.x, corners[0]!.y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Handles (skip the rotate handle for multi-selection).
      const handles = handlePoints(el);
      const isSingle = scene.selected.length === 1;
      const top = this.worldCorner(el, b.width / 2, 0);
      const rotate = handles.find((h) => h.id === "rotate");

      if (isSingle && rotate) {
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(rotate.x, rotate.y);
        ctx.strokeStyle = "#4f8cff";
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = "#4f8cff";
        ctx.arc(rotate.x, rotate.y, HANDLE_HIT_RADIUS - 2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const h of handles) {
        if (h.id === "rotate") continue;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#4f8cff";
        ctx.lineWidth = 1.5;
        ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
        ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
      }
    }
    ctx.restore();
  }

  private worldCorner(el: BaseElement, lx: number, ly: number): { x: number; y: number } {
    const b = el.bounds;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    let dx = lx - b.width / 2;
    let dy = ly - b.height / 2;
    if (el.rotation) {
      const c = Math.cos(el.rotation);
      const s = Math.sin(el.rotation);
      const rx = dx * c - dy * s;
      const ry = dx * s + dy * c;
      dx = rx;
      dy = ry;
    }
    return { x: dx + cx, y: dy + cy };
  }

  /** Convert a DOM event point to world coordinates (inverse of the view). */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale
    };
  }

  /** Expose the context for tools that need direct drawing (rare). */
  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  setCursor(cursor: string): void {
    this.canvas.style.cursor = cursor;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export type { BaseElement };
