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
  - `setElementAnchor(el, point)` — change the anchor **without moving the
    element**; it only changes which reference point tracks the artboard during
    later resizes ("pins it down"). The offset is recomputed live on relayout.
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

### P7 — Creation-aware assignment + hierarchical layers ✅
- `Scene.artboardAtPoint(p)` returns the topmost artboard whose bounds contain a
  point.
- `ShapeTool` and `TextTool` auto-assign a newly created element to the artboard
  under the creation point (`el.artboardId = ab.id` before `scene.add`), so it is
  clipped to that artboard immediately. Artboards themselves are never assigned.
- `LayerPanel` now renders the hierarchy: each artboard row is followed by its
  assigned children, **indented** under it (`.layer-row.child` with a left guide;
  artboard rows bolded via `.is-artboard`). Free elements render at top level.
- Layer signature now includes `artboardId` so assignment changes trigger a
  rebuild. Drag-reorder still operates on the flat scene order.

### P8 — Free-on-top z-order + Alt-duplicate + Shift angle/direction snapping ✅
- **Free objects always render above artboard contents.** `CanvasRenderer.render`
  now draws, in order: (1) artboards, (2) assigned elements clipped to their
  artboard, (3) free elements (`artboardId == null`) on top — so a free object
  is never hidden behind an artboard-contained one, regardless of scene order.
- **Alt-drag to duplicate.** In `SelectTool`, holding Alt on pointer-down clones
  the current selection (and, for any selected artboard, its assigned children,
  reassigned to the cloned artboard) into a new selection, then drags the clones
  while the originals stay put. `duplicateSelection` handles the cloning.
- **Shift = 45°/90° constraints.**
  - Dragging (SelectTool): pointer delta is snapped to the nearest 45° direction.
  - Rotating (SelectTool): final rotation snaps to the nearest 45° increment
    (0°, 45°, 90°, …).
  - Drawing a line (ShapeTool): the line angle snaps to the nearest 45° increment
    (rect/ellipse keep the existing Shift square-lock). Pointer-up discard now
    uses segment length so thin/diagonal lines (and shapes) aren't removed.

### P9 — Label takes click priority over children ✅
- `ArtboardElement.hitLabel(p)` returns true when a world point lands on the
  label band (the strip rendered just above the frame), evaluated in the
  artboard's rotated local frame so it stays correct under rotation.
- `Scene.hitTest` now tests artboard label bands **first** (front-to-back),
  returning the artboard before any child/other element is considered. So
  clicking an artboard's label always selects/moves the artboard, even when a
  child object overlaps the label. Clicks elsewhere on the artboard still hit
  children first (then the artboard as background).

### P10 — Seeded A4 canvas + numbered artboards ✅
- `App` seeds a single A4 artboard (794×1123 px ≈ 210×297 mm @ 96 DPI) at
  start, named `"Artboard 1"`.
- `ArtboardTool` numbers every drawn artboard sequentially: `"Artboard N"`
  where `N = scene.artboards.length + 1`, so the first user-drawn board is
  `"Artboard 2"`, the next `"Artboard 3"`, and so on. (Seed is `1` so the
  sequence is consistent; can rename the seed to plain `"Artboard"` if you'd
  prefer the literal "additional only" reading.)

### P11 — Artboard moves via label only (no accidental drags) ✅
- `ArtboardElement.hitEdge(p)` (rotation-aware, ~6px border strip) added;
  `hitTestLocal` now matches only the **label band** or **border edge** — the
  interior is no longer a hit target, so dragging empty artboard space can't
  grab the board.
- `SelectTool.onPointerDown` only begins an artboard drag when the press is on
  its **label**; pressing an edge selects the board (select-only handle) but
  does not move it. Children are still hit-tested first, so interior element
  interaction is unchanged.

### P12 — Selection only from exposed parts ✅
- `Scene.hitTest` now only selects an element on its **actually-visible** region.
  Added `isExposed(el, p)`: a free element is fully exposed, but an element
  assigned to an artboard is only exposed within that artboard's (axis-aligned)
  clip rectangle — so you can no longer grab a clipped element through its
  hidden, clipped-away area. The front-to-back order already handled occlusion
  (you can only hit the topmost element at a point), so combined: selection only
  succeeds on the exposed part, especially when clamped inside a canvas.

### P13 — Clone refinement: hidden child boxes + mid-drag Alt clone ✅
- `duplicateSelection` refactored into `cloneSelected` (returns only the
  top-level clones; an artboard's children are also cloned and reassigned to the
  new artboard but are **not** selected). Result: when cloning an artboard, only
  the artboard shows a bounding box during the drag — its child elements move
  along (via `beginDrag`'s child-inclusion) but their boxes are hidden.
- **Mid-drag Alt clone.** `SelectTool.onPointerMove` now clones on the fly when
  Alt is pressed during an active move-drag (`cloneAndContinue`): it duplicates
  the selection, rebases the drag onto the clones, and leaves the originals
  where Alt was pressed. Works for any element, not just artboards. `clonedThisDrag`
  guards against a second clone (and avoids double-cloning when Alt was already
  held at pointer-down).

### P14 — Artboard + children as one z-unit (layer-order aware) ✅
- Chosen model: **free objects always render above artboard contents** (P8 rule
  preserved), but each artboard now renders as a single z-unit with its assigned
  children, in scene/layer order. `CanvasRenderer.render` builds a `childrenOf`
  map and, per artboard, draws the board then its clipped children together.
- Effect: reordering an artboard in the Layers panel moves its whole stack
  (background + contents) as one, and a higher artboard fully covers a lower
  one — including the lower one's children (previously a lower artboard's
  children could leak above an upper artboard's background). Free elements and
  orphaned (stale-assignment) elements still draw on top.

### P15 — Mid-drag clone = restore origin + commit on release ✅
- Clone (Alt) during a drag is now a **tentative preview**, not an immediate
  commit. `SelectTool.startClonePreview` restores the originals to their
  pre-drag positions and **hides them** (`visible = false`) so only the ghost
  clones show during the drag; `CanvasRenderer.setPreview`/`drawPreview` render
  them as semi-transparent ghosts (children of a cloned artboard are clipped to
  the ghost board). Artboard children are cloned but kept out of the top-level
  selection, so their boxes stay hidden.
- The clone is only **committed on mouse release** (`commitClonePreview` adds
  the ghosts to the scene and selects only the top-level clones). Works for
  Alt-at-pointer-down too, and for any element type including artboards. All
  preview state is cleared on pointer-up.
- **Alt-unpress while moving commits** — `onPointerMove` commits the clone at
  the current ghost position when Alt is released *during* the drag (the final
  cursor position becomes the committed position) and leaves the source
  unrendered, then fully resets. `resetDragState` clears all drag/preview state.
  (If Alt is held all the way to mouse-release, the `onPointerUp` Alt-held
  commit is the fallback.)

### P16 — Source unrendered when Alt not held at release ✅ (reverted)
- `CanvasRenderer.render` honors `BaseElement.visible`: an invisible artboard is
  skipped entirely (with its children), invisible assigned children are skipped
  inside the clip, invisible free elements are skipped, and the selection
  overlay skips hidden elements. `visible` therefore hides an element from paint
  without removing it from the scene.
- `SelectTool` (P15/P16) hid the source during a clone *preview* and only
  revealed it if Alt was held at release. **This was reverted** — see P17.

### P17 — Plain Alt-drag clone (Figma/Illustrator style) ✅
- Reverted the preview/cancel-on-release clone model. `SelectTool` now does a
  plain duplicate: holding Alt at pointer-down **or** pressing Alt mid-drag
  clones the current selection (and any selected artboard's children,
  reassigned to the cloned board) into new elements, selects the clones, and
  drags them while the **originals stay put** — exactly like Figma/Illustrator.
- `cloneSelection(ctx, offsetX, offsetY)` builds the clones (offset so a
  mid-drag Alt duplicates at the current cursor position, original snapping
  back to its start). No ghost/preview, no on-release conditional, no
  `visible`-based hiding. `clonedThisDrag` guards against double-cloning.
- Removed the dead preview path from `CanvasRenderer` (`preview` field,
  `drawPreview`, `setPreview`). The `visible`-honoring paint path (P16) remains
  as a general capability (e.g. layer visibility toggles) but is no longer
  driven by the clone flow.

### P18 — Rectangular (marquee) group selection ✅
- `SelectTool` now supports a rubber-band group selection: dragging on empty
  canvas starts a marquee rectangle. Every (unlocked) element whose bounds
  intersect the marquee is selected live as the rectangle grows.
- **Shift** adds to the existing selection (the selection at drag-start is kept
  as a base); without Shift the selection clears on press, so a plain empty
  click still deselects.
- `CanvasRenderer` gained a `marquee` rect + `setMarquee()` and draws it as a
  translucent blue fill with a dashed border, above all content. The marquee
  clears on pointer-up. Locked elements are excluded from marquee selection.

### P19 — Orange label highlight for selected artboards ✅
- `CanvasRenderer.drawSelectionOverlay` now draws an orange label highlight
  (translucent `#ff8c00` band + orange name text) for any selected
  `ArtboardElement`, replicating the element's own transform so it lines up
  under rotation. Gives a clear, always-visible move handle for artboards.

### P20 — Zoom-compensated artboard handles + crossed-arrow cursor ✅
- Artboard label/edge hit areas now inflate with zoom-out: `handleScale(scale)`
  returns `max(1, 1/scale)`, applied to the label band height (18→larger) and
  edge strip (6→larger) so they stay grabbable when zoomed far out. `scale` is
  threaded `BaseElement.hitTest → Scene.hitTest → SelectTool` (via
  `ctx.renderer.scale`), with safe defaults so non-artboard hit-testing is
  unchanged.
- Hovering an artboard's label/edge now shows the `move` (crossed-arrows)
  cursor as its move affordance; the selected artboard still shows resize
  cursors on its scale/rotate handles.

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
