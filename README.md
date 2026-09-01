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
- **UI shell** — 4-col grid (`180px | 1fr | 220px | 280px`): left **tool palette** (collapsible Geometry/Interaction/Workspace + **boolean sub-panel next to Workspace**), center **stage** canvas, right **layers** + **properties** sidebar (fill/stroke/opacity/rotation/shadow, artboard/anchor, Convert to Path), floating **Activity console** + **TextEditor** overlay + **PathEditor** vertex editing. Tool lister hidden for now.
- Strict **TypeScript 6** with `verbatimModuleSyntax` and isolated modules.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check (tsc --noEmit) + production build
npm run preview  # preview the production build
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Posulpx/huez)

- **Framework:** Vite (auto-detected), **Build command:** `npm run build`, **Output:** `dist/`, **Node:** `>=18`.
- `vercel.json` sets `buildCommand`, `outputDirectory`, `rewrites` (SPA fallback) and long-lived caching for `/assets/*`.
- No env vars required. Push to `master` to auto-deploy, or `vercel --prod` locally.
- Local preview of the production build: `npm run build && npm run preview` (serves `dist/`).

## Project layout

```
HueZ Canvas Tool Modules
│
├── Drawing Tools
│   ├── PenTool.ts        → Precision path creation, anchors, bezier curves
│   ├── PencilTool.ts     → Freehand sketching, smoothing (Chaikin/Douglas-Peucker)
│   └── ShapeTool.ts      → Rectangles, ellipses, polygons
│
├── Layout Tools
│   ├── ArtboardTool.ts   → Multi-artboard management, alt+drag duplication
│   ├── AlignTool.ts      → 9-point element anchors, snapping
│   └── GridTool.ts       → Guides, rulers, layout grids
│
├── Management Tools
│   ├── SelectionTool.ts  → Multi-select, group/ungroup, marquee, group transform as one
│   ├── TransformTool.ts  → Scale, rotate, skew (group-aware)
│   └── LayerTool.ts      → Hierarchy control, visibility toggles
│
└── Utility Tools
    ├── ColorTool.ts      → Fill, stroke, palette management (eyedropper)
    ├── ExportTool.ts     → Output to SVG/PNG
    └── HistoryTool.ts    → Undo/redo stack (History + Clipboard, Ctrl+Z/Y/C/V)

src/
├─ engine/
│  ├─ types.ts, BaseElement.ts, Scene.ts, CanvasRenderer.ts, TransformHandles.ts
│  ├─ anchor.ts, shapeToPath.ts, booleanOps.ts, booleanOpsPaper.ts
│  ├─ history.ts         # snapshot undo/redo (clone + ID-mapped selection)
│  └─ clipboard.ts       # copy/paste to selected dashboards, preserve coords
├─ elements/            # ArtboardElement, TextElement, ShapeElement, PathElement
└─ ui/
   ├─ App.ts            # 4-col grid (180px | 1fr | 220px | 280px), wires all
   ├─ ToolPalette.ts    # collapsible groups + boolean sub-panel next to Workspace
   ├─ BooleanPanel.ts   # (legacy) now embedded as sub-panel in ToolPalette Workspace
   ├─ PropertiesPanel.ts# Convert to Path, style controls
   ├─ PathEditor.ts, TextEditor.ts, LayerPanel.ts, ActivityPanel.ts
   └─ styles.css        # panel + tool lister (hidden) + boolean-subpanel
```

## Architecture

```
┌──────────────────────────────────┐   pointer events   ┌──────────────┐   mutates   ┌────────┐
│     UI (4-col grid)              │ ─────────────────▶ │ ToolManager  │ ──────────▶ │ Scene  │
│ Palette(+Boolean next to         │                    │  (active     │             │(graph) │
│ Workspace) | Stage | Layers |    │ ◀──── renders ───── │   Tool)      │ ◀─ notify ──│        │
│ Properties + Activity            │                    │              │             │        │
└──────────────────────────────────┘                    └──────────────┘             └───┬────┘
                                                                     │ draws
                                                             ┌───────▼───────┐
                                                             │ CanvasRenderer│
                                                             └───────────────┘
```
- Grid: `180px (palette incl. boolean sub-panel next to Workspace) | 1fr (stage) | 220px (layers) | 280px (properties)`.

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
