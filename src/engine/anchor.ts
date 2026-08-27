import type { AnchorPoint, Point } from "./types";
import type { BaseElement } from "./BaseElement";
import type { Scene } from "./Scene";
import { rectOf, worldPointRect, type Rect } from "./TransformHandles";

/**
 * Anchor logic: positions an element relative to the artboard it is assigned
 * to. Each element has an `anchor` (one of nine points, default top-center).
 * On artboard resize/rotate, a child keeps the same offset between its anchor
 * point and the artboard's matching anchor point — so, e.g., a child anchored
 * `n` stays horizontally centered and top-aligned to the artboard as it grows.
 */

/** Local (top-left-origin) coordinate of an anchor point on a rect. */
function anchorLocal(r: { w: number; h: number }, a: AnchorPoint): Point {
  if (a === "center") return { x: r.w / 2, y: r.h / 2 };
  const fx = a.includes("w") ? 0 : a.includes("e") ? r.w : r.w / 2;
  const fy = a.includes("n") ? 0 : a.includes("s") ? r.h : r.h / 2;
  return { x: fx, y: fy };
}

/** World position of an anchor point on a (possibly rotated) rect. */
export function anchorWorld(r: Rect, a: AnchorPoint): Point {
  const lp = anchorLocal(r, a);
  return worldPointRect(r, lp.x, lp.y);
}

/** Move an element so its anchor point lands at a target world position. */
export function setElementAnchorWorld(el: BaseElement, a: AnchorPoint, target: Point): void {
  const b = el.bounds;
  const w = b.width;
  const h = b.height;
  const rot = el.rotation;
  const lp = anchorLocal({ w, h }, a);
  const dx = lp.x - w / 2;
  const dy = lp.y - h / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const vx = dx * c - dy * s;
  const vy = dx * s + dy * c;
  el.x = target.x - vx - w / 2;
  el.y = target.y - vy - h / 2;
}

/**
 * Reposition every child assigned to `artboard` after the artboard's rect
 * changed from `oldArt` to its current rect, preserving each child's anchor
 * offset (rotated by any change in the artboard's rotation).
 */
export function relayoutChildrenForArtboard(
  scene: Scene,
  artboard: BaseElement,
  oldArt: Rect
): void {
  const newArt = rectOf(artboard);
  const dRot = newArt.rotation - oldArt.rotation;
  const cosD = Math.cos(dRot);
  const sinD = Math.sin(dRot);

  for (const child of scene.all) {
    if (child === artboard) continue;
    if (child.artboardId !== artboard.id) continue;

    const oldChild = rectOf(child);
    const ea = anchorWorld(oldChild, child.anchor);
    const aaOld = anchorWorld(oldArt, child.anchor);
    const ox = ea.x - aaOld.x;
    const oy = ea.y - aaOld.y;
    const rx = ox * cosD - oy * sinD;
    const ry = ox * sinD + oy * cosD;

    const aaNew = anchorWorld(newArt, child.anchor);
    setElementAnchorWorld(child, child.anchor, { x: aaNew.x + rx, y: aaNew.y + ry });
  }
}

/**
 * Change an element's anchor, keeping it visually in place by preserving its
 * offset from the artboard's anchor point. When `artboard` is null the anchor
 * is just recorded (it only takes effect once assigned to an artboard).
 */
export function setElementAnchor(
  el: BaseElement,
  artboard: BaseElement | null,
  newAnchor: AnchorPoint
): void {
  if (!artboard) {
    el.anchor = newAnchor;
    return;
  }
  const ab = rectOf(artboard);
  const oldChild = rectOf(el);
  const ea = anchorWorld(oldChild, el.anchor);
  const aaOld = anchorWorld(ab, el.anchor);
  const ox = ea.x - aaOld.x;
  const oy = ea.y - aaOld.y;
  el.anchor = newAnchor;
  const aaNew = anchorWorld(ab, newAnchor);
  setElementAnchorWorld(el, newAnchor, { x: aaNew.x + ox, y: aaNew.y + oy });
}
