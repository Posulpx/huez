import type { Tool } from "../tools/Tool";
import { getRecords, subscribeRecords, type ToolRecord } from "../tools/records";

/**
 * Left-hand vertical palette of selectable tools. Renders one button per
 * tool, highlights the active one, and — at the bottom — a "tool lister"
 * that tracks every tool's usage and the last active element's properties
 * (shared style vs tool-specific), pulling from the tool records service.
 */
export class ToolPalette {
  private buttons = new Map<string, HTMLButtonElement>();
  private lister: HTMLElement;

  constructor(
    private root: HTMLElement,
    tools: Tool[],
    private onSelect: (id: string) => void,
    initialId: string
  ) {
    this.root.innerHTML = "";
    const title = document.createElement("h2");
    title.className = "panel-title";
    title.textContent = "Tools";
    this.root.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "tool-grid";
    this.root.appendChild(grid);

    for (const tool of tools) {
      const btn = document.createElement("button");
      btn.className = "tool-btn";
      btn.title = tool.label;
      btn.innerHTML = `<span class="tool-icon">${tool.icon}</span><span class="tool-label">${tool.label}</span>`;
      btn.addEventListener("click", () => this.select(tool.id));
      grid.appendChild(btn);
      this.buttons.set(tool.id, btn);
    }

    // Tool lister lives at the bottom of the sidebar.
    const listerTitle = document.createElement("h2");
    listerTitle.className = "panel-title lister-title";
    listerTitle.textContent = "Tool lister";
    this.root.appendChild(listerTitle);

    this.lister = document.createElement("div");
    this.lister.className = "tool-lister";
    this.root.appendChild(this.lister);

    subscribeRecords(() => this.renderLister());
    this.renderLister();

    this.select(initialId);
  }

  select(id: string): void {
    for (const [key, btn] of this.buttons) {
      btn.classList.toggle("active", key === id);
    }
    this.onSelect(id);
  }

  private renderLister(): void {
    const records = getRecords();
    this.lister.innerHTML = "";
    for (const rec of records) {
      this.lister.appendChild(this.listerRow(rec));
    }
  }

  private listerRow(rec: ToolRecord): HTMLElement {
    const row = document.createElement("button");
    row.className = "lister-row";
    if (rec.active) row.classList.add("active");
    row.title = `Activate ${rec.label}`;
    row.addEventListener("click", () => this.select(rec.id));

    const head = document.createElement("div");
    head.className = "lister-head";

    const name = document.createElement("span");
    name.className = "lister-name";
    name.textContent = rec.label;

    const meta = document.createElement("span");
    meta.className = "lister-meta";
    meta.textContent = rec.active ? "active" : `used ${rec.used}×`;

    const dot = document.createElement("span");
    dot.className = `lister-dot ${rec.active ? "on" : "off"}`;

    head.appendChild(dot);
    head.appendChild(name);
    head.appendChild(meta);

    row.appendChild(head);
    row.appendChild(this.propsBlock("shared", rec.shared));
    row.appendChild(this.propsBlock("specific", rec.specific));

    return row;
  }

  private propsBlock(kind: string, bag: Record<string, string>): HTMLElement {
    const block = document.createElement("div");
    block.className = `lister-props ${kind}`;
    const keys = Object.keys(bag);
    if (keys.length === 0) {
      const empty = document.createElement("span");
      empty.className = "lister-prop-empty";
      empty.textContent = `${kind}: —`;
      block.appendChild(empty);
      return block;
    }
    for (const k of keys) {
      const item = document.createElement("span");
      item.className = "lister-prop";
      const keyEl = document.createElement("i");
      keyEl.textContent = k;
      item.appendChild(keyEl);
      item.appendChild(document.createTextNode(` ${bag[k] ?? ""}`));
      block.appendChild(item);
    }
    return block;
  }
}
