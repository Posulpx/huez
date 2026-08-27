# HueZ — Roadmap & Progress

A modular, open-source **Canvas API tool library** in TypeScript. HueZ is a
small design-tool substrate: a scene graph, canvas renderer, pluggable tools,
and panels — built so tools can be authored, registered, and hot-swapped.

- **Stack:** TypeScript `^6.0.3` (strict), Vite `^6.4.3`, vanilla DOM (no UI framework).
- **Entry:** `index.html` → `src/ui/main.ts` → `App` wires engine + tools + panels.

---

## Status Legend
- ✅ Done
- 🚧 In progress
- 📋 Planned

---

## Milestones

### M0 — Project scaffold ✅
- `package.json`, `tsconfig.json` (strict: `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`, `isolatedModules`, `exactOptionalPropertyTypes: false`),
  `vite.config.ts`, `index.html` (4-column grid: palette / stage / layers /
  properties + `#activity` + `#scene`).
- `npm run build` (`tsc --noEmit && vite build`) and dev server verified.

### M1 — Engine core ✅
- `engine/types.ts` — `Point`, `Size`, `Bounds`, `ShapeKind`, `ShadowStyle`,
  `ElementStyle`, `defaultStyle`, `cloneStyle`.
- `engine/BaseElement.ts` — visible/locked/`artboardId`, rotation **about center**,
  `draw`/`hitTestLocal`/`clone`/`moveTo`.
- `engine/Scene.ts` — layers, selection, z-order (`bringForward`/`sendBackward`/
  `bringToFront`/`sendToBack`/`reorder`/`setVisible`/`setLocked`/`rename`/
  `assignToArtboard`), `getElementById`, `artboards`, `hitTest` (artboards tested
  **last**, as backgrounds).
- `engine/CanvasRenderer.ts` — DPR + viewport transform (`scale`, `offsetX/Y`),
  artboard-first render + clip, selection overlay (rotated outline + handles),
  `setCursor`, `zoomAt` / `pan` / `panWorld` / `resetView`, `toWorld`.
- `engine/TransformHandles.ts` — `HandleId`, `Rect`, `worldPointRect`,
  `localPointRect`, `handlePoints`, `hitHandle`, `handleEdges`.

### M2 — Elements ✅
- `elements/TextElement.ts` — dynamic text, `fontSize`-driven bounds.
- `elements/ShapeElement.ts` — rectangle / ellipse / line.
- `elements/ArtboardElement.ts` — container; **label band** (≈18px above frame)
  is part of the hit area so it acts as a select/move handle; clips assigned
  children (selection overlay never clipped).
- `elements/index.ts` barrel.

### M3 — Tools ✅
- `tools/Tool.ts` — `Tool` + `ToolContext` (incl. `shiftKey`, `altKey`, `setCursor`).
- `tools/ToolManager.ts` — register/unregister/setActive/has/list; builds a fresh
  `ToolContext` per event; logs lifecycle + API calls.
- `tools/SelectTool.ts` — select / shift-multi-select; drag (children of a selected
  artboard **move with it**); on-canvas **scale** + **rotate** handles; hover cursors.
- `tools/ShapeTool.ts`, `tools/TextTool.ts`, `tools/ArtboardTool.ts`, `tools/PanTool.ts`.
- `tools/log.ts` — subscribeable event bus (console + subscribers).
- `tools/records.ts` — per-tool usage counts + shared/specific element props.

### M4 — UI panels ✅
- `ui/App.ts` — wires engine + tools + panels; wheel zoom; middle-mouse pan;
  pointer capture; forwards `shiftKey` + `altKey`.
- `ui/ToolPalette.ts` — tool buttons + bottom **Tool lister** (usage + shared/specific
  props, click to activate).
- `ui/PropertiesPanel.ts` — fill / stroke / opacity / rotation / shadow + name +
  artboard-assign dropdown (routes through `scene.assignToArtboard`) + text controls.
- `ui/LayerPanel.ts` — drag-to-reorder, SVG visibility/lock toggles.
- `ui/ActivityPanel.ts` — floating console of log events.
- `ui/styles.css`, `ui/main.ts`.

### M5 — Interactive artboard assignment ✅
- **Drag-to-assign:** dropping a moved (non-artboard) element **on** an artboard
  assigns it (`scene.assign`, `el → <id>`); dropping it **outside** any artboard
  frees it (`el → free`). Center-point hit test against topmost artboard.
- `Scene.assignToArtboard(el, id|null)` sets + emits so panels refresh.

### M6 — 9-point anchor relative to artboard ✅
- `BaseElement.anchor: AnchorPoint` (one of `nw,n,ne,w,center,e,sw,s,se`),
  default **`n` (top-center)**.
- `src/engine/anchor.ts`:
  - `anchorWorld(rect, point)` — world position of an anchor on a (rotated) rect.
  - `setElementAnchorWorld(el, point, target)` — place an element by its anchor.
  - `relayoutChildrenForArtboard(scene, artboard, oldArt)` — when an artboard is
    resized/rotated, each assigned child keeps its offset from the artboard's
    matching anchor point (offset rotated for artboard rotation changes).
  - `setElementAnchor(el, artboard, point)` — change anchor, keeping the element
    visually in place (preserves its current offset).
- `SelectTool` calls `relayoutChildrenForArtboard` after artboard scale/rotate.
- `PropertiesPanel` shows a 3×3 anchor picker when the element is assigned to an
  artboard; selecting a point re-anchors immediately. CSS in `styles.css`.
- `anchor` is cloned with the element.

---

## Progress Log

A chronological record of everything implemented. Milestones (M0–M6) group the
work by area; this log is the plain-English change history.

### P0 — Scaffold & first build ✅
- `package.json`, `tsconfig.json` (strict), `vite.config.ts`, `index.html` (4-col grid).
- Engine (`types`, `BaseElement`, `Scene`, `CanvasRenderer`, `TransformHandles`),
  elements (`Text`, `Shape`, `Artboard`), tools (`Tool`, `ToolManager`, `Select`,
  `Shape`, `Text`, `Artboard`, `Pan`, `log`, `records`), UI panels (`App`,
  `ToolPalette`, `PropertiesPanel`, `LayerPanel`, `ActivityPanel`, `styles`, `main`).
- Pinned TypeScript to `^6.0.3` (6.x latest on registry; 7.x is `latest`).
- `README.md` + `LICENSE` (MIT) created on request.
- Verified `npm run build` (`tsc --noEmit && vite build`) and dev server boot (HTTP 200).

### P1 — Artboard label as select/move handle + child carry ✅
- `ArtboardElement.hitTestLocal` extended with a **label band** (≈18px above the
  frame) so clicking the label selects and drags the artboard.
- `SelectTool.beginDrag` adds any element assigned to a selected artboard into the
  drag set; the move loop iterates captured origins, so an artboard **carries its
  children** when dragged.

### P2 — Interactive drag-to-assign to artboards ✅
- `Scene.hitTest` rewritten to test **non-artboard elements first**, then
  artboards (as backgrounds), so elements on an artboard are selectable.
- `Scene.assignToArtboard(el, id|null)` added (sets + emits so panels refresh).
- `SelectTool.assignDropped` on drop assigns each moved non-artboard element to the
  **topmost artboard under its center** (`scene.assign`, `el → <id>`), or frees it
  if dropped outside any artboard (`el → free`).
- `PropertiesPanel` artboard dropdown routes through `scene.assignToArtboard`.

### P3 — Resize: selection fix + Shift/Alt modifiers ✅
- Selection fix folded into P2 (`hitTest` artboard-last).
- Resize gained **Shift = ratio lock** (corners) and **Alt = center pivot**.
- `ToolContext.altKey` added and threaded `App → ToolManager → SelectTool`.

### P4 — Resize root-cause fix (rotation-aware) ✅
- The old scale math wrongly used a *local-frame* coordinate (origin at the
  element top-left, ~`[0, w]`) as a *world* coordinate, collapsing the element to
  its minimum and breaking rotated resizes.
- Rewrote scaling to be **anchor-based and rotation-aware**: the handle opposite
  the dragged one stays fixed at its original world position; the cursor is
  projected onto the element's rotated width/height axes so the dragged handle
  stays glued at **any rotation**. Added `anchorLocalStart()`.

### P5 — Flip on resize (negative scale) ✅
- Added `signedClamp` so sizes may cross zero and become negative — dragging a
  handle past the opposite edge **flips** the object.
- Engine supports negative width/height: `ShapeElement`/`ArtboardElement`
  `hitTestLocal` normalize the box; `CanvasRenderer` clip rect normalized.
- Text elements don't mirror, so they resize with absolute extents (no flip).

### P6 — 9-point anchor relative to artboard ✅
- `AnchorPoint` type (`nw,n,ne,w,center,e,sw,s,se`), default **`n` (top-center)**.
- `src/engine/anchor.ts`: `anchorWorld`, `setElementAnchorWorld`,
  `relayoutChildrenForArtboard` (re-anchors assigned children on artboard
  resize/rotate, rotating the offset for artboard-rotation changes), `setElementAnchor`.
- `BaseElement.anchor` added (default `n`) and cloned with the element.
- `SelectTool` calls `relayoutChildrenForArtboard` after artboard scale/rotate —
  **closes the old "children don't follow the artboard" gap** (positionally).
- `PropertiesPanel` shows a 3×3 anchor picker (only when assigned); CSS added.

---

## Known Limitations
- ✅ Resizing / rotating an **artboard** now re-anchors its assigned children
  (see M6) — this closes the old "children don't follow the artboard" gap.
- 📋 No zoom-% readout or reset-view button in the UI.
- 📋 No keyboard nudges / snap-to-grid.
- 📋 No scene or tool-record persistence (localStorage).
- 📋 No visual drop-target highlight while dragging over an artboard.

---

## Planned Next
1. 📋 **Nested geometry follow** — M6 makes children *reposition* with the
   artboard, but their own size/rotation still doesn't scale with it. A full
   nested-transform model would scale/rotate children's geometry too.
2. 📋 Zoom % readout + reset-view button.
3. 📋 Keyboard nudges + snap-to-grid.
4. 📋 localStorage persistence of scene + tool records.
5. 📋 Runtime hot-swap helper (`window.huez.tools`).
6. 📋 Drop-target highlight while dragging.
7. 📋 Visual anchor-offset markers on the artboard; anchor keyboard shortcuts.
