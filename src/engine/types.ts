export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ShapeKind = "rectangle" | "ellipse" | "line";

/** The nine anchor points used to position an element relative to the
 *  artboard it is assigned to (default `n` = top-center). */
export type AnchorPoint =
  | "nw" | "n" | "ne"
  | "w" | "center" | "e"
  | "sw" | "s" | "se";

export interface ShadowStyle {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Visual style shared by every element on the canvas.
 * These map 1:1 onto the Canvas 2D API painting properties.
 */
export interface ElementStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
  shadow: ShadowStyle;
}

export function defaultStyle(): ElementStyle {
  return {
    fill: "#4f8cff",
    stroke: "#1b1f24",
    strokeWidth: 2,
    opacity: 1,
    shadow: {
      enabled: false,
      color: "rgba(0,0,0,0.35)",
      blur: 12,
      offsetX: 4,
      offsetY: 4
    }
  };
}

export function cloneStyle(style: ElementStyle): ElementStyle {
  return {
    ...style,
    shadow: { ...style.shadow }
  };
}
