import type { Scene } from '../engine/Scene'
import type { CanvasRenderer } from '../engine/CanvasRenderer'
import type { Point } from '../engine/types'

/**
 * Shared context handed to every tool on each pointer event.
 */
export interface ToolContext {
  scene: Scene
  renderer: CanvasRenderer
  /** World-space point for the current event. */
  point: Point
  /** Screen-space point (CSS pixels relative to the canvas) for the current event. */
  screenPoint: Point
  /** Original point where the current drag started (if any). */
  start: Point | null
  shiftKey: boolean
  /** Alt/Option held — used for center-pivot transforms. */
  altKey: boolean
  /** Request a repaint — tools call this after mutating the scene. */
  requestRender(): void
  /** Update the canvas cursor (used for hover/transform affordances). */
  setCursor(cursor: string): void
}

export type ToolCategory = 'geometry' | 'interaction' | 'workspace'

/**
 * A tool reacts to pointer interaction and drives the scene. Tools never
 * touch the DOM directly; they communicate through ToolContext.
 */
export interface Tool {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly cursor: string
  /** Wiring: which collapsible palette group the tool belongs to. */
  readonly category: ToolCategory
  onActivate?(ctx: ToolContext): void
  onDeactivate?(ctx: ToolContext): void
  onPointerDown(ctx: ToolContext): void
  onPointerMove(ctx: ToolContext): void
  onPointerUp(ctx: ToolContext): void
  onKeyDown?(ctx: ToolContext, key: string): void
}
