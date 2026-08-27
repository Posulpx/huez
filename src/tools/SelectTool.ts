import type { Tool, ToolContext } from "./Tool";
import type { BaseElement } from "../engine/BaseElement";
import type { Point } from "../engine/types";
import {
  hitHandle,
  worldPointRect,
  handleEdges,
  type HandleId,
  type Rect
} from "../engine/TransformHandles";
import { ShapeElement } from "../elements/ShapeElement";
import { ArtboardElement } from "../elements/ArtboardElement";
import { TextElement } from "../elements/TextElement";
import { relayoutChildrenForArtboard } from "../engine/anchor";
import { logApiCall } from "./log";

interface TransformState {
  mode: "scale" | "rotate";
  handle: HandleId;
  start: Rect & { fontSize: number };
  startAngle: number;
}

/**
 * Selects elements (click or shift-click to multi-select), drags the
 * current selection, and — on a single selection — drives on-canvas
 * transform controls: scale handles (resize) and a rotate handle.
 */
export class SelectTool implements Tool {
  readonly id = "select";
  readonly label = "Select";
  readonly icon = "▶";
  readonly cursor = "default";

  private dragging = false;
  private start: Point | null = null;
  private origins = new Map<string, Point>();
  private transform: TransformState | null = null;
  private moved = false;

  onPointerDown(ctx: ToolContext): void {
    this.moved = false;
    const selected = ctx.scene.selected;

    // Intercept handles on a single selection before any move/select.
    if (selected.length === 1 && !selected[0]!.locked) {
      const hit = hitHandle(selected[0]!, ctx.point);
      if (hit) {
        this.beginTransform(ctx, selected[0]!, hit);
        return;
      }
    }

    this.moved = false;
    const target = ctx.scene.hitTest(ctx.point);
    if (target) {
      if (!ctx.scene.isSelected(target)) {
        ctx.scene.select(target, ctx.shiftKey);
        logApiCall(`scene.select`, target.id);
      }
      this.beginDrag(ctx);
    } else if (!ctx.shiftKey) {
      ctx.scene.clearSelection();
      logApiCall(`scene.clearSelection`);
    }
  }

  private beginDrag(ctx: ToolContext): void {
    this.dragging = true;
    this.start = { ...ctx.point };
    this.origins.clear();
    for (const el of ctx.scene.selected) {
      this.origins.set(el.id, { x: el.x, y: el.y });
      // Children assigned to a selected artboard move with it.
      if (el instanceof ArtboardElement) {
        for (const child of ctx.scene.all) {
          if (child.artboardId === el.id && !this.origins.has(child.id)) {
            this.origins.set(child.id, { x: child.x, y: child.y });
          }
        }
      }
    }
  }

  private beginTransform(ctx: ToolContext, el: BaseElement, handle: HandleId): void {
    const b = el.bounds;
    const start: Rect & { fontSize: number } = {
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      rotation: el.rotation,
      fontSize: el instanceof TextElement ? el.fontSize : b.height
    };
    let startAngle = 0;
    if (handle === "rotate") {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      startAngle = Math.atan2(ctx.point.y - cy, ctx.point.x - cx);
    }
    this.transform = { mode: handle === "rotate" ? "rotate" : "scale", handle, start, startAngle };
    logApiCall(`select.${handle === "rotate" ? "rotate" : "scale"}`, handle);
    ctx.requestRender();
  }

  onPointerMove(ctx: ToolContext): void {
    if (this.transform) {
      this.updateTransform(ctx);
      return;
    }
    if (this.dragging && this.start) {
      this.moved = true;
      const dx = ctx.point.x - this.start.x;
      const dy = ctx.point.y - this.start.y;
      for (const [id, o] of this.origins) {
        const el = ctx.scene.getElementById(id);
        if (el) el.moveTo(o.x + dx, o.y + dy);
      }
      ctx.requestRender();
      return;
    }
    this.updateHoverCursor(ctx);
  }

  private updateTransform(ctx: ToolContext): void {
    const t = this.transform!;
    const el = ctx.scene.selected[0];
    if (!el) return;

    // Capture the artboard's rect before mutating, so assigned children can
    // be re-anchored relative to the new rect (resize/rotate).
    const isArtboard = el instanceof ArtboardElement;
    const oldArt = isArtboard
      ? { x: el.x, y: el.y, w: el.width, h: el.height, rotation: el.rotation }
      : null;

    if (t.mode === "rotate") {
      const cx = t.start.x + t.start.w / 2;
      const cy = t.start.y + t.start.h / 2;
      const angle = Math.atan2(ctx.point.y - cy, ctx.point.x - cx);
      el.rotation = t.start.rotation + (angle - t.startAngle);
      if (isArtboard && oldArt) relayoutChildrenForArtboard(ctx.scene, el, oldArt);
      ctx.requestRender();
      return;
    }

    // Scale: resize about the anchor opposite the dragged handle, in the
    // element's rotated local frame, so handles stay glued to the cursor
    // for any rotation. Supports Shift (ratio lock) and Alt (center pivot).
    const rot = t.start.rotation;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const ux = c, uy = s; // width axis in world space
    const vx = -s, vy = c; // height axis in world space
    const w0 = t.start.w;
    const h0 = t.start.h;
    const scx = t.start.x + w0 / 2;
    const scy = t.start.y + h0 / 2;

    // Anchor (opposite the dragged handle) in world space, from the START rect.
    const aLocal = anchorLocalStart(t.handle, w0, h0);
    const A = worldPointRect(t.start, aLocal.x, aLocal.y);
    const dAx = ctx.point.x - A.x;
    const dAy = ctx.point.y - A.y;
    const du = dAx * ux + dAy * uy; // cursor delta along width
    const dv = dAx * vx + dAy * vy; // cursor delta along height

    const edges = handleEdges(t.handle);
    const widthFree = edges.west || edges.east;
    const heightFree = edges.north || edges.south;
    const signX = edges.east ? 1 : edges.west ? -1 : 0;
    const signY = edges.south ? 1 : edges.north ? -1 : 0;

    const MIN = 4;
    let nw = widthFree ? signedClamp(signX * du, MIN) : w0;
    let nh = heightFree ? signedClamp(signY * dv, MIN) : h0;

    // Shift: ratio lock (corners only) — keep aspect, anchor stays fixed.
    if (ctx.shiftKey && widthFree && heightFree) {
      const f = Math.max(Math.abs(nw) / w0, Math.abs(nh) / h0);
      const sw = nw < 0 ? -1 : 1;
      const sh = nh < 0 ? -1 : 1;
      nw = w0 * f * sw;
      nh = h0 * f * sh;
    }

    // Alt: center pivot — symmetric stretch about the start center.
    if (ctx.altKey) {
      const dCx = ctx.point.x - scx;
      const dCy = ctx.point.y - scy;
      const duC = dCx * ux + dCy * uy;
      const dvC = dCx * vx + dCy * vy;
      nw = widthFree ? signedClamp(2 * duC, MIN) : w0;
      nh = heightFree ? signedClamp(2 * dvC, MIN) : h0;
      if (ctx.shiftKey && widthFree && heightFree) {
        const f = Math.max(Math.abs(2 * duC) / w0, Math.abs(2 * dvC) / h0);
        nw = w0 * f * (nw < 0 ? -1 : 1);
        nh = h0 * f * (nh < 0 ? -1 : 1);
      }
    }

    nw = signedClamp(nw, MIN);
    nh = signedClamp(nh, MIN);

    // Text can't mirror, so it resizes with absolute extents (no flip).
    const useNw = el instanceof TextElement ? Math.abs(nw) : nw;
    const useNh = el instanceof TextElement ? Math.abs(nh) : nh;

    let nx: number, ny: number;
    if (ctx.altKey) {
      nx = scx - useNw / 2;
      ny = scy - useNh / 2;
    } else {
      // Keep the opposite handle anchored at its original world position.
      const anchorAx = edges.east ? -useNw / 2 : edges.west ? useNw / 2 : 0;
      const anchorAy = edges.south ? -useNh / 2 : edges.north ? useNh / 2 : 0;
      const cx = A.x - (anchorAx * c - anchorAy * s);
      const cy = A.y - (anchorAx * s + anchorAy * c);
      nx = cx - useNw / 2;
      ny = cy - useNh / 2;
    }

    el.x = nx;
    el.y = ny;

    if (el instanceof ShapeElement || el instanceof ArtboardElement) {
      el.width = nw; // signed: a negative value means the object is flipped
      el.height = nh;
    } else if (el instanceof TextElement) {
      const factor = useNh / t.start.h;
      el.fontSize = Math.max(4, t.start.fontSize * factor);
    }
    if (isArtboard && oldArt) relayoutChildrenForArtboard(ctx.scene, el, oldArt);
    ctx.requestRender();
  }

  private updateHoverCursor(ctx: ToolContext): void {
    const selected = ctx.scene.selected;
    if (selected.length !== 1 || selected[0]!.locked) {
      ctx.setCursor("default");
      return;
    }
    const hid = hitHandle(selected[0]!, ctx.point);
    if (!hid) {
      ctx.setCursor("move");
      return;
    }
    switch (hid) {
      case "rotate":
        ctx.setCursor("grab");
        break;
      case "nw":
      case "se":
        ctx.setCursor("nwse-resize");
        break;
      case "ne":
      case "sw":
        ctx.setCursor("nesw-resize");
        break;
      case "n":
      case "s":
        ctx.setCursor("ns-resize");
        break;
      default:
        ctx.setCursor("ew-resize");
    }
  }

  onPointerUp(ctx: ToolContext): void {
    if (this.transform) {
      this.transform = null;
      return;
    }
    if (this.dragging && this.moved) {
      this.assignDropped(ctx);
    }
    this.dragging = false;
    this.start = null;
    this.origins.clear();
  }

  /** On drop, assign each moved element to the topmost artboard under its
   *  center, or free it if dropped outside any artboard. */
  private assignDropped(ctx: ToolContext): void {
    for (const [id] of this.origins) {
      const el = ctx.scene.getElementById(id);
      if (!el || el instanceof ArtboardElement) continue;
      const target = this.artboardUnder(el, ctx.scene);
      const nextId = target ? target.id : null;
      if (el.artboardId !== nextId) {
        ctx.scene.assignToArtboard(el, nextId);
        logApiCall("scene.assign", `${el.id} → ${nextId ?? "free"}`);
      }
    }
  }

  private artboardUnder(el: BaseElement, scene: ToolContext["scene"]): ArtboardElement | null {
    const b = el.bounds;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const arts = scene.artboards;
    for (let i = arts.length - 1; i >= 0; i--) {
      const a = arts[i]!;
      if (cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height) {
        return a;
      }
    }
    return null;
  }
}

/** Top-left-origin local coordinate of the anchor (handle OPPOSITE the
 *  dragged one) within the element's unrotated start rect. */
function anchorLocalStart(id: HandleId, w: number, h: number): { x: number; y: number } {
  switch (id) {
    case "se": return { x: 0, y: 0 }; // anchor nw
    case "nw": return { x: w, y: h }; // anchor se
    case "ne": return { x: 0, y: h }; // anchor sw
    case "sw": return { x: w, y: 0 }; // anchor ne
    case "s": return { x: w / 2, y: 0 }; // anchor n
    case "n": return { x: w / 2, y: h }; // anchor s
    case "e": return { x: 0, y: h / 2 }; // anchor w
    case "w": return { x: w, y: h / 2 }; // anchor e
    default: return { x: 0, y: 0 };
  }
}

/** Clamp magnitude to at least `min` while preserving the sign, so a size
 *  can cross zero and become negative (a flipped element) instead of being
 *  forced back to a positive minimum. */
function signedClamp(v: number, min: number): number {
  if (v >= 0) return Math.max(min, v);
  return Math.min(-min, v);
}
