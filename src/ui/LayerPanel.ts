import type { Scene } from "../engine/Scene";
import type { BaseElement } from "../engine/BaseElement";

/**
 * Layers panel: lists every element in z-order (top = front), with
 * per-layer visibility and lock toggles, rename, and reorder buttons.
 * Rebuilds only when the layer *structure* changes — renaming while
 * typing does not trigger a rebuild, so the name input keeps focus.
 */
export class LayerPanel {
  private lastSignature = "";
  private dragId: string | null = null;

  constructor(
    private root: HTMLElement,
    private scene: Scene,
    private requestRender: () => void
  ) {
    this.scene.subscribe(() => this.maybeRender());
    this.render();
  }

  /** Rebuild the DOM only if layer order/state/selection changed. */
  private maybeRender(): void {
    const sig = this.signature();
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;
    this.render();
  }

  private signature(): string {
    const parts = this.scene.layers.map(
      (e) => `${e.id}:${e.visible ? 1 : 0}:${e.locked ? 1 : 0}`
    );
    const sel = [...this.scene.selected].map((e) => e.id).join(",");
    return parts.join("|") + "#" + sel;
  }

  private render(): void {
    this.root.innerHTML = "";

    const title = document.createElement("h2");
    title.className = "panel-title";
    title.textContent = "Layers";
    this.root.appendChild(title);

    if (this.scene.layers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No layers yet. Use a tool to add elements.";
      this.root.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "layer-list";
    this.root.appendChild(list);

    // Front-most layer first (top of the list).
    const layers = [...this.scene.layers].reverse();
    for (const el of layers) {
      list.appendChild(this.row(el));
    }
  }

  private row(el: BaseElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "layer-row";
    row.draggable = true;
    if (this.scene.isSelected(el)) row.classList.add("active");

    row.addEventListener("click", (e) => {
      // Avoid re-selecting when interacting with a control inside the row.
      if ((e.target as HTMLElement).closest(".layer-controls")) return;
      this.scene.select(el);
    });

    this.bindDrag(row, el);

    const name = document.createElement("input");
    name.type = "text";
    name.className = "layer-name";
    name.value = el.name;
    name.title = "Rename layer";
    name.addEventListener("click", (e) => e.stopPropagation());
    name.addEventListener("change", () => this.scene.rename(el, name.value || el.name));

    const controls = document.createElement("div");
    controls.className = "layer-controls";

    controls.appendChild(
      this.toggle("visible", el.visible, "Show / hide", () => {
        this.scene.setVisible(el, !el.visible);
        this.requestRender();
      })
    );
    controls.appendChild(
      this.toggle("locked", el.locked, "Lock / unlock", () => {
        this.scene.setLocked(el, !el.locked);
      })
    );

    row.appendChild(name);
    row.appendChild(controls);
    return row;
  }

  /** Wire native HTML5 drag-and-drop for reordering this layer row. */
  private bindDrag(row: HTMLElement, el: BaseElement): void {
    row.addEventListener("dragstart", (e) => {
      this.dragId = el.id;
      row.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", el.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    row.addEventListener("dragend", () => {
      this.dragId = null;
      row.classList.remove("dragging");
      this.clearDropMarkers();
    });

    row.addEventListener("dragover", (e) => {
      if (!this.dragId || this.dragId === el.id) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const after = this.isBelowMid(row, e.clientY);
      row.classList.toggle("drag-over-bottom", after);
      row.classList.toggle("drag-over-top", !after);
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });

    row.addEventListener("drop", (e) => {
      if (!this.dragId || this.dragId === el.id) return;
      e.preventDefault();
      const after = this.isBelowMid(row, e.clientY);
      this.applyDrop(this.dragId, el.id, after);
      this.clearDropMarkers();
    });
  }

  private isBelowMid(row: HTMLElement, clientY: number): boolean {
    const r = row.getBoundingClientRect();
    return clientY > r.top + r.height / 2;
  }

  private clearDropMarkers(): void {
    this.root
      .querySelectorAll(".drag-over-top, .drag-over-bottom")
      .forEach((n) => n.classList.remove("drag-over-top", "drag-over-bottom"));
  }

  /**
   * Reorder so the dragged layer lands next to the target in the panel
   * (front-to-back). Panel order is reversed to back-to-front before
   * handing it to the scene.
   */
  private applyDrop(dragId: string, targetId: string, after: boolean): void {
    const panelOrder = [...this.scene.layers].reverse().map((e) => e.id);
    const from = panelOrder.indexOf(dragId);
    if (from < 0) return;
    panelOrder.splice(from, 1);
    let to = panelOrder.indexOf(targetId);
    if (to < 0) return;
    if (after) to += 1;
    panelOrder.splice(to, 0, dragId);
    this.scene.reorder([...panelOrder].reverse());
  }

  private toggle(state: "visible" | "locked", on: boolean, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = `layer-toggle ${state} ${on ? "on" : "off"}`;
    btn.title = title;
    btn.innerHTML = state === "visible" ? eyeIcon(on) : lockIcon(on);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }
}

const SVG = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

function eyeIcon(visible: boolean): string {
  if (visible) {
    return `<svg ${SVG} width="16" height="16"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
  return `<svg ${SVG} width="16" height="16"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

function lockIcon(locked: boolean): string {
  if (locked) {
    return `<svg ${SVG} width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }
  return `<svg ${SVG} width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
}
