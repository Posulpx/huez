# HueZ

> Modular, open-source **Canvas API** tool modules — Text, dynamic Shapes, Fills, Strokes, Drop Shadows, and more.

HueZ is a small, framework-agnostic foundation for building canvas-based design
tools. It ships with a clean separation between the **rendering engine**, the
**element modules**, the **interaction tools**, and the **UI**, so you can extend
it with new primitives without fighting the core.

## Features

- **Engine core** — a scene graph, a DPR-aware `CanvasRenderer`, and shared style types.
- **Element modules** — `TextElement` (dynamic text), `ShapeElement` (rectangle, ellipse, line), and `ArtboardElement` containers that clip assigned elements. Drop an element on an artboard to contain it; drop it outside to free it (also assignable via the properties panel).
- **Tool modules** — `SelectTool`, `ShapeTool` (drag-to-draw), and `TextTool`, driven through a `ToolManager`.
- **UI shell** — a left **tool palette**, a right **properties sidebar** (fill, stroke, opacity, drop shadow, text content), and a floating **Activity console** that live-streams tool lifecycle + API-call events.
- Strict **TypeScript 6** with `verbatimModuleSyntax` and isolated modules.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check (tsc --noEmit) + production build
npm run preview  # preview the production build
```

## Project layout

```
src/
├─ engine/              # rendering core (no DOM-tooling dependencies)
│  ├─ types.ts          # Point, Bounds, ElementStyle, ShadowStyle
│  ├─ BaseElement.ts    # transform + style + hit-testing base class
│  ├─ Scene.ts          # scene graph, selection, change subscriptions
│  └─ CanvasRenderer.ts # DPR-aware rendering + selection overlay
├─ elements/            # the "tool modules" (extend BaseElement)
│  ├─ TextElement.ts
│  └─ ShapeElement.ts
├─ tools/               # pointer-driven tools
│  ├─ Tool.ts           # Tool + ToolContext interfaces
│  ├─ ToolManager.ts
│  ├─ SelectTool.ts
│  ├─ ShapeTool.ts
│  └─ TextTool.ts
└─ ui/
   ├─ App.ts            # wires engine + tools + panels
   ├─ ToolPalette.ts    # left tool buttons
   ├─ PropertiesPanel.ts# right properties sidebar
   ├─ styles.css
   └─ main.ts           # bootstrap
```

## Architecture

```
┌─────────────┐   pointer events   ┌──────────────┐   mutates   ┌────────┐
│     UI      │ ─────────────────▶ │ ToolManager  │ ──────────▶ │ Scene  │
│ Palette /   │                    │  (active     │             │(graph) │
│ Properties  │ ◀──── renders ───── │   Tool)      │ ◀─ notify ──│        │
└─────────────┘                    └──────────────┘             └───┬────┘
                                                                    │ draws
                                                            ┌───────▼───────┐
                                                            │ CanvasRenderer│
                                                            └───────────────┘
```

- **`ElementStyle`** maps 1:1 onto Canvas 2D API properties
  (`fillStyle`, `strokeStyle`, `shadowColor`, `shadowBlur`, …), so new style
  modules are mechanical to add.
- **Tools** are stateless about the DOM — they only receive a `ToolContext`
  (scene, renderer, world-space point, shift state, and a `requestRender`)
  and drive the scene.
- The **`Scene`** is the single source of truth and notifies subscribers
  (renderer + properties panel) on every change.
- **Tools are logged on every lifecycle event** (register / activate /
  unregister) via `src/tools/log.ts`, giving a live audit trail of which
  tool modules are loaded. This is the foundation for hot-swapping tools
  at runtime.

## Tool API (endpoints)

Every tool module plugs into the same contract. These are the "endpoints"
of the tool system:

### `Tool` interface (`src/tools/Tool.ts`)

| Member | Signature | Purpose |
| --- | --- | --- |
| `id` | `readonly string` | Unique module key (used for registration & hot-swap). |
| `label` | `readonly string` | Human-readable name (palette / logs). |
| `icon` | `readonly string` | Palette glyph. |
| `cursor` | `readonly string` | CSS cursor while the tool is active. |
| `onActivate?` | `(ctx: ToolContext) => void` | Called when the tool becomes active. |
| `onDeactivate?` | `(ctx: ToolContext) => void` | Called when switching away. |
| `onPointerDown` | `(ctx: ToolContext) => void` | Pointer pressed. |
| `onPointerMove` | `(ctx: ToolContext) => void` | Pointer moved (even when not dragging). |
| `onPointerUp` | `(ctx: ToolContext) => void` | Pointer released. |

### `ToolContext` (passed to every handler)

| Field | Type | Description |
| --- | --- | --- |
| `scene` | `Scene` | The scene graph (add/remove/select, z-order, hit-test). |
| `renderer` | `CanvasRenderer` | Canvas access + `toWorld()` coordinate conversion. |
| `point` | `Point` | Current pointer position in world coordinates. |
| `start` | `Point \| null` | Pointer position where the current drag began. |
| `shiftKey` | `boolean` | Modifier state at event time. |
| `requestRender` | `() => void` | Ask the host to repaint (call after mutating). |

### `ToolManager` methods (`src/tools/ToolManager.ts`)

| Method | Description |
| --- | --- |
| `register(tool)` | Add a tool module (logged as *created*). |
| `unregister(id)` | Remove a tool at runtime (hot-swap out). |
| `setActive(id)` | Switch the live tool (logged as *activated*). |
| `has(id)` | Check whether a tool is registered. |
| `list()` | All registered tool instances. |
| `current` | The active tool (`Tool \| null`). |
| `pointerDown/Move/Up(...)` | Forward DOM events to the active tool. |

### Logger (`src/tools/log.ts`)

`logToolRegistered`, `logToolActivated`, `logToolUnregistered` — call them
(or rely on `ToolManager`, which calls them automatically) so every tool
module announces itself in the console.

## Tool authoring guidelines

We craft each tool as an isolated, hot-swappable module:

1. **One responsibility per tool.** A tool does one interaction (draw, select,
   place text). Compose, don't cram.
2. **Stay DOM-agnostic.** Tools never touch the DOM or the event system —
   they receive a `ToolContext` and mutate the `Scene` via `requestRender`.
3. **Register, don't hard-wire.** Create the instance, `register` it with the
   `ToolManager`, and let the palette/shortcuts activate it. This is what makes
   a tool removable (`unregister`) and replaceable at runtime.
4. **Be explicit about lifecycle.** Use `onActivate`/`onDeactivate` for setup
   and teardown (listeners, cursors, transient state) so swapping tools leaves
   no residue.
5. **Log on creation.** Registration is logged automatically; if you build a
   tool factory, log there too so the module inventory stays accurate.
6. **Keep state minimal.** Prefer capturing ephemeral drag state as private
   fields reset in `onPointerUp`, and always derive positions from the
   cumulative pointer delta to avoid translate jumps.

## Extending HueZ

**Add a new element** — subclass `BaseElement`, implement `localBounds`,
`render`, `hitTestLocal`, and `cloneSelf`:

```ts
import { BaseElement } from "./engine/BaseElement";

export class ImageElement extends BaseElement {
  // ...
}
```

**Add a new tool** — implement the `Tool` interface and register it:

```ts
import { ToolManager } from "./tools";

tools.register(new MyTool()); // logged: "+ tool registered: my-tool — My Tool"
```

**Add a style control** — extend `ElementStyle` / `ShadowStyle` and surface it
in `PropertiesPanel`.

## Roadmap

- Image & freehand path elements
- Gradient and pattern fills
- Snapping, guides, and alignment
- Scene JSON serialize / load
- Undo / redo history

## License

[MIT](./LICENSE)
