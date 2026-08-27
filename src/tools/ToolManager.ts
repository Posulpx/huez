import type { Tool } from "./Tool";
import type { ToolContext } from "./Tool";
import { logApiCall, logToolActivated, logToolRegistered, logToolUnregistered } from "./log";
import { ensureTool, setToolActive } from "./records";

/**
 * Owns the active tool and forwards pointer events to it, building a
 * fresh ToolContext per event. Keeps tool implementations stateless
 * about the canvas plumbing.
 *
 * Tools are registered here, which makes them discoverable and
 * hot-swappable: register/unregister at runtime, then `setActive` to
 * switch the live tool. Every lifecycle event is logged.
 */
export class ToolManager {
  private active: Tool | null = null;
  private start: ToolContext["start"] = null;
  private tools = new Map<string, Tool>();

  constructor(
    private scene: ToolContext["scene"],
    private renderer: ToolContext["renderer"],
    private requestRender: () => void
  ) {}

  /** Register a tool module (logged as created into the manager). */
  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
    ensureTool(tool.id, tool.label);
    logToolRegistered(tool);
  }

  /** Remove a tool module at runtime to support hot-swapping. */
  unregister(id: string): void {
    const tool = this.tools.get(id);
    if (!tool) return;
    if (this.active === tool) this.active = null;
    this.tools.delete(id);
    logToolUnregistered(tool);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  get current(): Tool | null {
    return this.active;
  }

  setActive(id: string): void {
    const next = this.tools.get(id);
    if (!next || next === this.active) return;
    const ctx = this.makeContext({ x: 0, y: 0 }, false, false);
    this.active?.onDeactivate?.(ctx);
    this.active = next;
    this.active.onActivate?.(ctx);
    this.renderer.setCursor(next.cursor);
    // Mark active/inactive across the usage records.
    for (const t of this.tools.values()) {
      setToolActive(t.id, t.label, t === next);
    }
    logToolActivated(next);
  }

  private makeContext(
    point: { x: number; y: number },
    shiftKey: boolean,
    altKey: boolean
  ): ToolContext {
    return {
      scene: this.scene,
      renderer: this.renderer,
      point,
      start: this.start,
      shiftKey,
      altKey,
      requestRender: this.requestRender,
      setCursor: (cursor: string) => this.renderer.setCursor(cursor)
    };
  }

  pointerDown(clientX: number, clientY: number, shiftKey: boolean, altKey = false): void {
    const point = this.renderer.toWorld(clientX, clientY);
    this.start = point;
    const ctx = this.makeContext(point, shiftKey, altKey);
    const tool = this.active;
    if (tool) logApiCall(`${tool.id}.onPointerDown`);
    tool?.onPointerDown(ctx);
  }

  pointerMove(clientX: number, clientY: number, shiftKey: boolean, altKey = false): void {
    const point = this.renderer.toWorld(clientX, clientY);
    const ctx = this.makeContext(point, shiftKey, altKey);
    this.active?.onPointerMove(ctx);
  }

  pointerUp(clientX: number, clientY: number, shiftKey: boolean, altKey = false): void {
    const point = this.renderer.toWorld(clientX, clientY);
    const ctx = this.makeContext(point, shiftKey, altKey);
    const tool = this.active;
    if (tool) logApiCall(`${tool.id}.onPointerUp`);
    tool?.onPointerUp(ctx);
    this.start = null;
  }
}
