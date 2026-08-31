# HueZ

> Modular, open-source **Canvas API** tool modules — Text, dynamic Shapes, Fills, Strokes, Drop Shadows, and more.

HueZ is a small, framework-agnostic foundation for building canvas-based design
tools. It ships with a clean separation between the **rendering engine**, the
**element modules**, the **interaction tools**, and the **UI**, so you can extend
it with new primitives without fighting the core.

## Features

- **Engine core** — scene graph, DPR-aware `CanvasRenderer` (selection overlay, pen node awareness, marquee), `TransformHandles`, 9-point `anchor` relative to artboard, `shapeToPath` (KAPPA), `booleanOps` (Add/Subtract/Intersect via `polygon-clipping` + `paper.js` bezier-preserving).
- **Element modules** — `TextElement` (tight ink, multiline, in-line editing), `ShapeElement` (rect/ellipse/line), `ArtboardElement` (label band + edge hit, clips children, 18px label), `PathElement` (cubic Bézier `PathAnchor` `hIn`/`hOut`, open/closed, drafting `resumeEnd`/`closingTarget`/`closingHover`, `hitAnchor`/`closestSegmentInfo`, `flatten` 16–24 steps).
- **Tool modules** — `SelectTool` (select/scale/rotate, artboard-aware, marquee), `ShapeTool`/`TextTool`/`ArtboardTool`/`PanTool`, `PenTool` (Bézier pen: open/close, symmetrical `Ctrl` opposite + `Alt` single, artboard auto-assign, node awareness, connect-any-open, proximity highlight).
- **UI shell** — 5-col grid (`180px | 180px | 1fr | 220px | 280px`): left **tool palette** (collapsible Geometry/Interaction/Workspace) + **boolean panel** next to workspace, center **stage** canvas, right **layers** + **properties** sidebar (fill/stroke/opacity/rotation/shadow, artboard/anchor, Convert to Path), floating **Activity console** + **TextEditor** overlay + **PathEditor** vertex editing.
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
│  ├─ types.ts          # Point, Bounds, ElementStyle, ShadowStyle, ShapeKind
│  ├─ BaseElement.ts    # transform + style + hit-testing + artboardId/anchor/rotation
│  ├─ Scene.ts          # scene graph, selection, z-order, artboardAtPoint, replace
│  ├─ CanvasRenderer.ts # DPR-aware rendering + selection overlay + pen node awareness
│  ├─ TransformHandles.ts
│  ├─ anchor.ts         # 9-point artboard anchoring
│  ├─ shapeToPath.ts    # primitive → PathElement (KAPPA ellipse)
│  ├─ booleanOps.ts     # Add/Subtract/Intersect (polygon-clipping + paper.js)
│  └─ booleanOpsPaper.ts# paper.js bezier-preserving boolean
├─ elements/            # the "tool modules" (extend BaseElement)
│  ├─ ArtboardElement.ts
│  ├─ TextElement.ts    # tight ink bounds, multiline, editing flag
│  ├─ ShapeElement.ts   # rect/ellipse/line
│  ├─ PathElement.ts    # Bézier path (PathAnchor hIn/hOut, drafting, closingTarget/Hover)
│  └─ index.ts
├─ tools/               # pointer-driven tools
│  ├─ Tool.ts           # Tool + ToolContext (shiftKey/altKey/ctrlKey)
│  ├─ ToolManager.ts    # register/unregister, makeContext with ctrlKey
│  ├─ SelectTool.ts     # select/scale/rotate, artboard-aware
│  ├─ ShapeTool.ts      # rect/ellipse/line + artboard auto-assign
│  ├─ TextTool.ts       # text + artboard auto-assign + TextEditor
│  ├─ ArtboardTool.ts
│  ├─ PanTool.ts
│  ├─ PenTool.ts        # Bézier pen (open/close, handles, node awareness, connect)
│  ├─ log.ts
│  └─ records.ts
└─ ui/
   ├─ App.ts            # wires engine + tools + panels (5-col grid)
   ├─ ToolPalette.ts    # left tool buttons (collapsible Geometry/Interaction/Workspace)
   ├─ BooleanPanel.ts   # left boolean panel next to workspace (Add/Subtract/Intersect)
   ├─ PropertiesPanel.ts# right properties sidebar + Convert to Path
   ├─ LayerPanel.ts
   ├─ ActivityPanel.ts
   ├─ TextEditor.ts
   ├─ PathEditor.ts     # vertex/handle editing
   ├─ styles.css        # 5-col grid: palette | boolean | stage | layers | properties
   └─ main.ts           # bootstrap (palette, boolean, layers, props, activity)
```

## Architecture

```
┌──────────────────────────────────┐   pointer events   ┌──────────────┐   mutates   ┌────────┐
│     UI (5-col grid)              │ ─────────────────▶ │ ToolManager  │ ──────────▶ │ Scene  │
│ Palette | Boolean | Stage |      │                    │  (active     │             │(graph) │
│ Layers | Properties + Activity   │ ◀──── renders ───── │   Tool)      │ ◀─ notify ──│        │
└──────────────────────────────────┘                    └──────────────┘             └───┬────┘
                                                                     │ draws
                                                             ┌───────▼───────┐
                                                             │ CanvasRenderer│
                                                             └───────────────┘
```
- Grid: `180px (palette) | 180px (boolean) | 1fr (stage) | 220px (layers) | 280px (properties)` — boolean panel lives next to workspace (left sidebar).

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
| `screenPoint` | `Point` | Screen-space point (CSS pixels relative to the canvas). |
| `start` | `Point \| null` | Pointer position where the current drag began. |
| `shiftKey` | `boolean` | Modifier state at event time. |
| `altKey` | `boolean` | Alt/Option — center-pivot, single-handle, etc. |
| `ctrlKey` | `boolean` | Ctrl/Cmd — opposite-side curve (like closing) for pen. |
| `setCursor` | `(cursor: string) => void` | Update canvas cursor. |
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
