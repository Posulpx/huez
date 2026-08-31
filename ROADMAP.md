# HueZ — Roadmap & Progress

A modular, open-source **Canvas API tool library** in TypeScript. HueZ is a
small design-tool substrate: a scene graph, canvas renderer, pluggable tools,
and panels — built so tools can be authored, registered, and hot-swapped.

- **Stack:** TypeScript `^6.0.3` (strict), Vite `^6.4.3`, vanilla DOM (no UI framework).
- **Entry:** `index.html` → `src/ui/main.ts` → `App` wires engine + tools + panels.

---

## Release Habit — Update ROADMAP on Every Patch / Minor / Major

> **Rule: no version bump ships without a ROADMAP update.** Every `patch` (fix), `minor` (feat), and `major` (breaking) milestone must append a Progress Log entry and, when it closes a milestone, flip that milestone to ✅.

**Habit loop (enforced):**

1. Bump version via `zx` (`npm run release:patch|minor|major` → `scripts/bump.mjs`) — never hand-edit `package.json` version.
2. The bump script creates the `### P<N> — <title> ✅` entry and updates `## Milestones` / version badge.
3. `lefthook` **pre-push** runs `zx scripts/check-roadmap.mjs` — if `package.json` version changed in the pushed commits but `ROADMAP.md` wasn't touched, the push is blocked with a fix hint.
4. `npm run check:roadmap` can be run locally at any time (CI runs it too).

**Commit convention (commitlint):** `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` or `feat!:`/`fix!:` → major. The bump script infers the level but you can override.

**Checklist for every release:**

- [ ] `package.json` version bumped (via `scripts/bump.mjs`)
- [ ] `ROADMAP.md` → new `P<N>` entry with scope, files, and verification (`tsc`, `vite build`, manual)
- [ ] `ROADMAP.md` → Milestones updated if a milestone closed
- [ ] `CHANGELOG` line added if `P<N>` is user-visible (optional, same commit)

See `scripts/bump.mjs` and `scripts/check-roadmap.mjs` for the automation.

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

### M7 — Tooling parity (ZX) + artboard-confined selection ✅
- `P23` — ZX parity: `zx` scripts, `prettier` parity, `lefthook`, `commitlint`; `P24` — selection confined to artboard origin (no cross-artboard Shift/marquee); `P25` — release habit automation (`scripts/bump.mjs`, `scripts/check-roadmap.mjs`, pre-push gate).

### M8 — Classified, collapsible tool palette ✅
- `P26` — `Tool.category` wiring + collapsible Geometry/Interaction/Workspace groups + persistence + styling.

### M9 — Text in-line editing (multiline, steady ink, hidden box) ✅
- `P28-P30` — tight ink bounds (pixel-perfect, gap removed), multiline (`split('\n')`, per-line metrics, `lineMetrics`), in-line editor (`TextEditor` overlay, `editing` flag, `dblclick` to edit, `TextTool` auto-edit, `CanvasRenderer` hides box when editing).

### M10 — Pen paths: open-end continuation, closing UX & artboard-aware construction ✅
- `P31` — open-end continuation from any open path, node awareness (`penActive`/`penHover`), `hOut`-based curve preview, `shapeToPath` + `Scene.replace` + "Convert to Path", artboard auto-assign (`artboardAtPoint`), `ToolContext` `ctrlKey` plumbing.
- `P32` — closing UX: proximity highlight (`closingHover` before click, skips `activeIndex`), orange `closingTarget` highlight + dashed mirror construction (`2*anchor - handle`), opposite-side curve via `2*anchor - handle` in `render`, flipped handle on commit to keep orange side, `closingCursor` rubber-band.
- `P33` — open-end handles: `Ctrl` in-curve/out-straight (opposite side like closing, `hIn@mirror` + `hOut null`), `Alt` straighten `In` (`hOut@cursor`, `hIn null`), neither falls back to symmetrical (`isStart` aware mirrored), flipping allowed on closing not on open, connect-any-open via `findOpenEndpointNear` + `reversePts` (swap `hIn`/`hOut`) merge.

### M11 — Simple boolean operands: Add, Subtract, Intersect ✅
- `P34` — `polygon-clipping` based boolean on closed `ShapeElement`/`PathElement` (flatten 24 steps, `storedToWorld`, closed-ring handling), `Add`/`Subtract`/`Intersect` via `PropertiesPanel` when 2 selected, multi-polygon results as multiple `PathElement`, handles rotation/artboard/style, empty-result handling.

---

## Progress Log

A chronological record of everything implemented. Milestones (M0–M9) group the
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

### P21 — Pen tool (Bézier paths) ✅
- New `PathElement` (`src/elements/PathElement.ts`): a cubic-Bézier path of
  anchors (`PathAnchor` with absolute world `hIn`/`hOut` handles; `null` =
  corner). Renders open polylines or closed shapes (stroke from `style`,
  optional fill when `closed`), with bounds from all anchors+handles.
  `hitTest` samples the curve (16 steps/segment) and uses a screen-constant
  tolerance (`6 / scale`). `moveTo` shifts every stored coordinate so the path
  is movable/transformable like other elements.
- New `PenTool` (`src/tools/PenTool.ts`): click drops a corner anchor; click-
  drag pulls out mirrored Bézier handles (out = cursor, in = mirror) for a
  smooth point. Clicking the first anchor closes the path; **Enter** finishes
  an open path; **Escape** cancels; switching tools also commits (or discards
  if < 2 points). The path is added to the scene live and shows anchor squares
  + handle arms + a dashed rubber-band to the cursor while drafting.
- `ToolContext` gained an optional `onKeyDown` hook; `ToolManager.keyDown`
  forwards it (with the last known world point), and `App` wires a `window`
  keydown listener (ignored while typing in form fields).

### P22 — Pen paths: fill-grab + ink-hugging bounds ✅
- `PathElement.hitWorld` now also hits when the point lies inside a **closed**
  path's filled area (ray-casting point-in-polygon on the sampled curve), so a
  pen shape is draggable from anywhere on its fill, not only on the stroke.
  Open paths still hit only the stroke (screen-constant `6 / scale` tolerance).
- `PathElement.bounds` is now derived from the sampled curve (`flatten()`)
  rather than the anchor + control-handle extremes, so the selection bounding
  box hugs the actual ink. `moveTo` still shifts every stored coordinate, so
  transform/move behave normally.

### P23 — Google ZX guidelines parity ✅
- `chore: impose google/zx guidelines — zx scripts, prettier parity, lefthook, commitlint` (`6567bd0`).
- Stack now mirrors [`google/zx`](https://github.com/google/zx): `zx@^8.8.5`,
  `prettier@3.9.1` (`semi:false, singleQuote:true, endOfLine:lf, trailingComma:es5`),
  `lefthook@^2.1.9`, `@commitlint/*@^21.1.0`.
- `package.json` (`type:module`, `prettier` field, `scripts: dev/build/check/fmt/fmt:check/prepare`),
  `tsconfig.json` (`resolveJsonModule`, `include: scripts`), `.prettierignore`,
  `.gitignore` (`build/coverage`), `lefthook.yml` (pre-commit `prettier --write`, commit-msg `commitlint`, pre-push `typecheck+fmt-check`), `.commitlintrc` (conventional).
- `scripts/` — `build.mjs`, `check.mjs`, `fmt.mjs`, `dev.mjs` as `#!/usr/bin/env zx` with `usePowerShell/useBash` win32 fallback (fixes `No quote function` when `bash` not in PATH on Windows).
- Formatted entire `src/` (30 files) to new prettier style; verified `tsc --noEmit`, `prettier --check`, `vite build`.

### P24 — Artboard-confined selection ✅
- `feat: confine selection to artboard origin — cross-artboard select blocked` (`e0e3e1c`) — closes the "select leaks across artboards" gap.
- `tools/SelectTool.ts`: `selectionScopeId(scene): string|null|undefined` (first selected's `artboardId`; `null` = free), `marqueeOriginId(ctx)` (base selection's scope or `artboardAtPoint(m.x0,m.y0)?.id ?? null`).
- `onPointerDown`: `Shift`-add is gated — if `origin !== undefined && target.artboardId !== origin` the foreign item is ignored (plain click replaces origin, always allowed).
- `updateMarqueeSelection`: `originId = marqueeOriginId(ctx)`, `insideArtboard = originId !== null`; artboards only when free, non-artboard items require `el.artboardId === originId`; bounds-intersect test unchanged; additive base kept. Effect: marquee inside `A` never pulls `B`/free, free marquee never pulls bound content, additive marquee from `A` inside `B` adds nothing.
- Verified with `npx tsx` harness (7 cases: shift-click blocked/allowed, plain replace, marquee A/free/additive), `tsc --noEmit`, `vite build`.

### P25 — Roadmap habit: every patch/minor/major updates ROADMAP ✅
- This entry. Establishes the habit: no `patch`/`minor`/`major` ships without a `ROADMAP.md` update (see "Release Habit" above).
- Automation: `scripts/bump.mjs` (version bump + ROADMAP stub), `scripts/check-roadmap.mjs` (CI + pre-push gate), `lefthook.yml` `check-roadmap` hook, `package.json` `release:*` + `check:roadmap` scripts.

---

### P26 — Tool palette — classify by Geometry/Interaction/Workspace, collapsible groups, fix wiring ✅
- `minor` bump `0.1.0 → 0.2.0` via `scripts/bump.mjs minor` (2026-08-30).
- `Tool.category` wiring fix: `src/tools/Tool.ts:12` now `category: 'geometry'|'interaction'|'workspace'` — Geometry (Circle/Ellipse, Rect, Line, Pen, Text), Interaction (Select, Pan + future Zoom/Fit), Workspace (Artboard + future Guide). Each tool sets `readonly category` (`SelectTool:8`, `PanTool:8`, `ShapeTool:11`, `TextTool:8`, `ArtboardTool:10`, `PenTool:8`).
- `src/ui/ToolPalette.ts:1` rewritten to group by `Tool.category` (wiring via `grouped: Map<ToolCategory,Tool[]>`), render collapsible `tool-group` sections (`CATEGORY_ORDER`, `CATEGORY_LABEL/HINT`, `STORAGE_KEY='huez:tool-groups:collapsed'`), `tool-group-header` with count+arrow, `tool-group-body` with `tool-grid`; toggle collapses + persists to `localStorage`, active tool auto-expands its group. Empty `workspace` shows "Guide — coming soon".
- `src/ui/styles.css:65` — `.tool-group`, `.tool-group-header/count/arrow`, `.tool-group-body` (hidden when `.collapsed`), `.tool-group-empty`.
- `src/ui/App.ts:22` wiring unchanged — `registerTools()` then `new ToolPalette(paletteRoot, this.tools.list(), ...)` — grouping now derived from `Tool.category` not id heuristics.
- Verified `npx tsc --noEmit`, `npx prettier --check`, `npx zx scripts/check.mjs`, `npx zx scripts/build.mjs` (53.9 kB).
### P27 — Fix Pan glitch + remove artboard rotation angle + linear Path scaling ✅
- `patch` bump `0.2.0 → 0.2.1` via `scripts/bump.mjs patch` (2026-08-30).
- **Pan glitch:** `PanTool` used world delta (`ctx.point.x - last.x` via `toWorld`) then `renderer.panWorld(dx*scale)`. Since `toWorld` depends on `offset` that `panWorld` just mutated, second `pointermove` computed `(sx2 - offset1)/scale - (sx1 - offset0)/scale` → `(sx2 -2*sx1+sx0)/scale`, so pan stalled at 10px then jittered (repro: scale 2, 100→110→120 gave 10,10 then stuck). Fix: `src/tools/Tool.ts:14` `ToolContext.screenPoint`, `src/engine/CanvasRenderer.ts:48` `toScreen()`, `src/tools/ToolManager.ts:20` tracks `lastScreen` + `makeContext(point,screenPoint)`, `src/tools/PanTool.ts:1` now stores `screenPoint` + `renderer.pan(dx,dy)`, cursor `grab`/`grabbing`.
- **Artboard rotation removed:** artboards are axis-aligned — `src/elements/ArtboardElement.ts:12` locks `rotation` to `0` via `Object.defineProperty` (no angle), `src/tools/SelectTool.ts:42` `beginTransform`/`onPointerDown` early-return for `rotate` on `ArtboardElement`, `updateTransform:60` guard, `updateHoverCursor:68` hides handle, `src/engine/CanvasRenderer.ts:60` skips rotate handle for artboards, `src/ui/PropertiesPanel.ts:56` rotation slider hidden for artboards.
- **Path scaling:** pen paths were not scalable — `src/tools/SelectTool.ts:68` `updateTransform` now handles `PathElement` via `localPointRect`/`worldPointRect` scaling of every anchor `x/y` + `hIn`/`hOut` from `oldRect` (`t.start`) to `newRect` (`nx,ny,useNw,useNh`) with `sx=useNw/w0`, `sy=useNh/h0`; `src/tools/SelectTool.ts:1` imports `localPointRect`. Non-linear fix: `TransformState.pathSnapshot` captures anchors at `beginTransform` and `updateTransform` scales from snapshot (not live `el.points`) to avoid compounding drift (east drag 10→50px now linear: 118→158 vs before 118→358).
- Verified `npx tsc --noEmit`, `prettier --check`, `vite build`.
### P28 — Text: bounding box hugs ink coverage only ✅
- `patch` bump `0.2.1 → 0.2.2` via `scripts/bump.mjs patch` (2026-08-30).
- `src/elements/TextElement.ts:12` — `tightMetrics()` pixel-perfect: offscreen canvas (`font` + `alphabetic`/`left`), `fillText` at `x0=pad+5, y0=pad+5+ascent`, `getImageData` scan for `alpha>8` to find `minX/maxX/minY/maxY`; `tightW=maxX-minX+1`, `tightH=maxY-minY+1`, `left=minX-x0`, `ascent=y0-minY`; cached via `_tightCache` keyed by `text+fontString`; fallback to `actualBoundingBox*`/`fontBoundingBox*` when `document` unavailable; `localBounds` `{0,0,tightW,tightH}`, `render()` draws at `drawX=-left, drawY=ascent` with `alphabetic` so `fillRect(0,0,b.width,b.height)` hugs ink; gap before first glyph now removed (scan finds true left edge).
- Guard for empty/degenerate and `document.createElement('canvas')` fallback.
- `src/elements/ArtboardElement.ts:12` + `src/engine/CanvasRenderer.ts:60` — artboard rotation fully removed (locked to `0` via `defineProperty`, no rotate handle).
- Verified `npx tsc --noEmit`, `prettier --check`, `vite build` (57.34 kB), manual: select text shows tight overlay, no gap before first character, fill hugs glyphs.
### P29 — Text: remove gap before first character — pixel-perfect scan ✅
- `patch` bump `0.2.2 → 0.2.3` via `scripts/bump.mjs patch` (2026-08-30).
- Follow-up to P28: `actualBoundingBox`-based tight bounds still left a small left bearing gap before the first glyph (e.g., "T" stem). Fix: `src/elements/TextElement.ts:12` now does offscreen pixel scan as primary — `tightMetrics()` creates `canvas`, `measureText` for `wAdv` + `ascentHint/descentHint`, `canvas.width/height = ceil(wAdv+pad)` etc., `fillText` at `x0=pad+5, y0=pad+5+ascentHint`, `getImageData` scan for `alpha>8` to get `minX/maxX/minY/maxY`; `tightW=maxX-minX+1`, `tightH=maxY-minY+1`, `left=minX-x0`, `ascent=y0-minY`; cached via `_tightCache`; fallback to `actualBoundingBox*` when `document` unavailable.
- `localBounds` and `render()` unchanged except now using pixel-perfect `left/ascent` so `drawX=-left` truly hugs leftmost ink and `fillRect(0,0,b.width,b.height)` has no leading gap; verified with "Text", "A", "  Text" — gap before first character now 0.
- Verified `npx tsc --noEmit`, `prettier --check`, `vite build` (57.34 kB).
### P30 — Text in-line editing, ink steady, box hidden, multiline ✅
- `minor` bump `0.2.3 → 0.3.0` via `scripts/bump.mjs minor` (2026-08-30).
- `src/elements/TextElement.ts:12` — `editing` flag, multiline support: `tightMetrics()` and `lineMetrics()` per-line pixel scan, `localBounds` width = max line tightW, height = sum tightH + gap (`max(4, fontSize*0.2)`), `render()` splits `text.split('\n')` and draws each line at `drawX=-left, drawY=y+ascent` with `alphabetic` baseline; `if (editing) return` hides canvas ink while editing (DOM textarea shows live text) — box hidden via `CanvasRenderer` check.
- `src/ui/TextEditor.ts:1` — new `TextEditor` (`stage, scene, renderer, requestRender`): creates `<textarea class="text-editor">` absolutely positioned at `world->screen` (`x*scale+offsetX`), `fontSize*scale`, `lineHeight 1.2`, `whiteSpace pre-wrap`, `overflow hidden`, `background transparent` + `border accent`; `startEdit(el)` sets `el.editing=true`, positions via `positionOverlay` (`b.x*scale+offsetX`), focuses/selects, `input` updates `el.text` live + `autoSize()` + `requestRender`, `keydown` Esc=cancel, Ctrl+Enter=commit, `blur` commits, `stage` pointerdown outside commits; `commit()` sets `el.text=ta.value`, `el.editing=false`, removes overlay, selects or removes if empty; `cancel()` restores; `sync()` on zoom/pan.
- `src/ui/App.ts:12` — `TextEditor` wired in `constructor` (`new TextEditor(stage, scene, renderer)`), `registerTools()` passes editor to `TextTool`, `bindCanvas()` adds `dblclick` to edit `TextElement`, `pointerdown` commits if editing hit mismatch, `pointermove`/`wheel`/`render()` call `textEditor.sync()`, `ToolPalette` switch commits.
- `src/tools/TextTool.ts:12` — `constructor(private editor?: TextEditor)`, `onPointerDown` creates `TextElement` at click, selects, then `requestAnimationFrame(() => editor.startEdit(el))` — ink stays at click point, box hidden.
- `src/engine/CanvasRenderer.ts:60` — `drawSelectionOverlay` skips `if (el instanceof TextElement && el.editing) continue` — caret (in DOM) does not affect canvas bounds.
- `src/ui/styles.css:60` — `.text-editor` absolute, `background rgba(15,17,21,0.92)`, `border accent`, `caret-color accent`, `min-width/height`, `z-index 10`.
- Verified `npx tsc --noEmit`, `prettier --check`, `vite build` (62.70 kB), manual: double-click text → textarea at same world pos, type multiline (Enter = newline), bounds hidden, pan/zoom keeps overlay aligned, ink steady.

### P31 — Pen tool: open-end continuation, node awareness & curve preview ✅
- `minor` bump `0.3.0 → 0.4.0` via `scripts/bump.mjs minor` (2026-09-01).
- `src/elements/PathElement.ts:30` — `resumeEnd: 'start'|'end'|null` for open-end preview; `renderDraft` draws `hOut`-based Bézier preview (`last.hOut` → cursor or `cursor → first.hIn` for start) with `[4,4]` dash.
- `src/tools/PenTool.ts:42` — `findOpenEndpointNear(p,scale,scene)` scans all open `PathElement` (skips `closed`/`drafting`), `8/scale` threshold, returns nearest `{path,index}`; `hoveredEndpoint` + `resumeEnd` + `resumeSnapshot` for cancel; `onPointerDown` resumes any open path (not just selected) via `cand.resumeEnd`, `onPointerMove` node awareness sets `renderer.setPenHover`/`setPenActive` and `copy` cursor; `addAnchor` respects `resumeEnd` (prepend vs append).
- `src/engine/CanvasRenderer.ts:25` — `penActive`/`penHover` + `drawPenNodeAwareness` (5px `isStart` tinted, 7px orange hover with outer ring, skips `drafting`/`closed`).
- `src/engine/Scene.ts:179` — `replace(oldEl,newEl)` preserving z-order/selection; `src/engine/shapeToPath.ts:17` — `shapeToPath` converts `ShapeElement` (rect/ellipse/line) to `PathElement` with `artboardId` preserved; `src/ui/PropertiesPanel.ts:56` — "Convert to Path" button for `ShapeElement`.
- `src/ui/App.ts:22` — `ToolContext` now includes `ctrlKey` (`e.ctrlKey||e.metaKey`) threaded `App → ToolManager → PenTool` for handle modifiers.
- Artboard auto-assign: `PenTool` `onPointerDown` new path does `scene.artboardAtPoint(p)` → `path.artboardId` (free otherwise), mirroring `ShapeTool`/`TextTool`.
- Verified `tsc --noEmit`, `vite build` (82–83 kB), manual: pen highlights any open endpoint, click near continues, rubber-band curve preview follows `hOut`.

### P32 — Closing UX: proximity highlight, construction mirror & opposite-side curve ✅
- `src/elements/PathElement.ts:32` — `closingTarget {index,kind}`, `closingCursor`, `closingHover`; `render` closing segment uses `2*anchor - handle` mirror when `closingTarget` set (flipped preview on orange side), `renderDraft` draws `8px` orange `closingTarget` highlight (`rgba(255,140,0,0.2)`), dashed `4,4` mirror construction line (`2*target - builtHandle` + `3px` dot `rgba(255,140,0,0.4)`), and `4,4` rubber-band via `closingCursor`.
- `src/tools/PenTool.ts:136` — `closing` state preserves `closingOrigin` opposite handle, sets `path.closed=true` + `closingTarget`/`closingCursor` on click near endpoint (`8/scale`, skips `resumeEnd` origin), `onPointerMove` updates `closingCursor` and built handle (`hIn`/`hOut` at cursor with `3/scale` threshold), `onPointerUp` flips built handle to mirror (`2*target - handle`) so final curve stays on orange side, then `finish()`.
- Proximity highlight before click: `PathElement.closingHover` + `PenTool` `onPointerMove` sets `closingHover` within `8/scale` of `first`/`last` (skips `activeIndex`/`resumeEnd`), drawn as `6px` `rgba(255,140,0,0.14)` square in `renderDraft`; active origin not highlighted.
- Verified `tsc --noEmit`, `vite build` (83.73 kB), manual: hover near closing node shows orange proximity highlight, click-drag shows orange dashed mirror and curve on opposite side, release keeps curve on orange side.

### P33 — Pen open-end handles: symmetrical default, Alt/Ctrl modifiers & connect-any-open ✅
- `src/tools/PenTool.ts:420` — open-end handles: `Ctrl` like closing (curve on opposite side, `in-curve`/`out-straight` via `hIn@mirror` + `hOut null`), `Alt` straightens `In` (`hOut@cursor`, `hIn null`), neither falls back to symmetrical (`isStart ? hOut@cursor/hIn@mirror : hOut@mirror/hIn@cursor` with `mirror = 2*dragStart - cursor`), mirrored only for open ends when `Ctrl`/`neither` (flipping allowed on closing, not on open per `PathElement` render mirror).
- `src/tools/PenTool.ts:188` — `findOpenEndpointNear` reuse for **connect any open-ended paths**: `onPointerDown` after `closeTarget` checks `otherHit !== this.path`, merges via `copyPt`/`reversePts` (swap `hIn`/`hOut` on reverse), `merged = reverse(other)+this` or `other+this` or `this+other` or `this+reverse(other)` per `thisIsStart`/`otherIsStart`, updates `points`/`resumeEnd`/`activeIndex`, `scene.remove(other)`, selects merged, `penHover`/`closingHover` cleared; `onPointerMove` also highlights other open endpoints via `setPenHover` + `copy` cursor while drafting.
- Verified `tsc --noEmit`, `vite build` (83.67 kB), manual: Ctrl-drag opposite side, Alt single, click-drag symmetrical; pen connects any two open paths on click near other endpoint, highlights on proximity.

### P34 — Simple boolean operands: Add, Subtract, Intersect ✅
- `minor` bump `0.3.0 → 0.4.0` via `scripts/bump.mjs minor` (2026-09-01).
- `src/engine/booleanOps.ts:1` — new `booleanOps` using `polygon-clipping` (`union`/`intersection`/`difference`): `toPolygon` flattens `PathElement` (24 steps/segment, `storedToWorld` for rotation, closes ring) or `ShapeElement` via `shapeToPath` (lines excluded, open paths rejected), `polygonToPath` converts outer ring to `PathElement` (corners, `closed=true`, style/artboard from source), `multiPolygonToPaths` for disjoint results, `booleanOp(a,b,op)` handles `MultiPolygon` and empty results.
- `src/ui/PropertiesPanel.ts:43` — when 2 elements selected, `booleanRow` shows `Add`/`Subtract`/`Intersect` (`union`/`difference`/`intersection` via `booleanOp`), removes originals, adds results (multiple `PathElement` for disjoint unions), selects results, handles empty/null with hint (`Need 2 closed shapes/paths` / `Result empty`).
- `package.json:10` — added `polygon-clipping@^0.16.0` (3 deps) for robust polygon boolean.
- Verified `npx tsc --noEmit`, `npm run build` (`vite build` 112.77 kB), manual: select 2 overlapping rects/ellipses/paths → Add merges, Subtract cuts B from A, Intersect keeps overlap, open paths/lines disabled.
### P35 — Preserve Bézier handles in boolean, fewer nodes ✅
- `patch` bump `0.4.0 → 0.4.1` via `scripts/bump.mjs patch` (2026-09-01).
- `src/engine/booleanOpsPaper.ts:1` — new paper.js based boolean (`toPaperPath` with `storedToWorld` + relative `handleIn`/`handleOut`, `paperPathToPathElement` preserves `hIn`/`hOut`, `extractPaths` handles `CompoundPath`); `src/engine/booleanOps.ts:1` now tries `booleanOpPaper` first (fewer nodes, preserves original Bézier segments) then falls back to `polygon-clipping` (24 steps).
- `package.json:10` — added `paper@^0.12.18` for handle-preserving boolean; `vite build` 112.77 kB → 357.84 kB (paper) but union of 2 rects now 8 points vs 100+ before, ellipse union preserves curves.
- Verified `npx tsc --noEmit`, `vite build`, manual: 2 overlapping rects Add → 8-point L-shape (was 100+), ellipse Add preserves handles, Subtract/Intersect correct, open paths still rejected.
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
