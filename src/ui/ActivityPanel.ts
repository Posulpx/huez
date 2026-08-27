import { subscribeLogs, getLogs, clearLogs, type LogEntry, type LogLevel } from "../tools/log";

/**
 * Small floating "code window" that renders live tool activity, API-call
 * endpoint invocations, and lifecycle events. Subscribes to the shared
 * log stream so it stays in sync with everything logged through
 * `src/tools/log.ts`.
 */
export class ActivityPanel {
  private body: HTMLElement;
  private collapsed = false;

  constructor(private root: HTMLElement) {
    this.root.innerHTML = "";

    const header = document.createElement("div");
    header.className = "activity-header";

    const title = document.createElement("span");
    title.className = "activity-title";
    title.textContent = "Activity";

    const actions = document.createElement("div");
    actions.className = "activity-actions";

    const clear = document.createElement("button");
    clear.className = "activity-btn";
    clear.textContent = "clear";
    clear.title = "Clear log";
    clear.addEventListener("click", (e) => {
      e.stopPropagation();
      clearLogs();
      this.body.innerHTML = "";
    });

    const toggle = document.createElement("button");
    toggle.className = "activity-btn";
    toggle.textContent = "–";
    toggle.title = "Collapse / expand";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    actions.appendChild(clear);
    actions.appendChild(toggle);
    header.appendChild(title);
    header.appendChild(actions);
    header.addEventListener("click", () => this.toggleCollapse());

    this.body = document.createElement("div");
    this.body.className = "activity-body";

    this.root.appendChild(header);
    this.root.appendChild(this.body);

    for (const entry of getLogs()) this.append(entry);
    subscribeLogs((entry) => this.append(entry));
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.root.classList.toggle("collapsed", this.collapsed);
  }

  private append(entry: LogEntry): void {
    const row = document.createElement("div");
    row.className = `activity-row ${levelClass(entry.level)}`;

    const time = document.createElement("span");
    time.className = "activity-time";
    time.textContent = formatTime(entry.time);

    const text = document.createElement("span");
    text.className = "activity-text";
    text.textContent = entry.text;

    row.appendChild(time);
    row.appendChild(text);
    this.body.appendChild(row);

    // Cap DOM rows to keep the window light.
    while (this.body.childElementCount > 300) {
      this.body.firstElementChild?.remove();
    }

    this.body.scrollTop = this.body.scrollHeight;
  }
}

function levelClass(level: LogLevel): string {
  switch (level) {
    case "register":
      return "lvl-register";
    case "activate":
      return "lvl-activate";
    case "unregister":
      return "lvl-unregister";
    case "api":
      return "lvl-api";
    default:
      return "lvl-info";
  }
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
