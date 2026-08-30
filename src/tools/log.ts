/**
 * Central, dependency-free logger and event bus for the modular tool
 * system.
 *
 * Every tool module logs when it is registered / activated / unregistered,
 * and tools can also record "API calls" (an endpoint invocation). Logs are
 * mirrored to the browser console AND emitted to subscribers, so the in-app
 * Activity window can render a live feed.
 */

export type LogLevel = 'register' | 'activate' | 'unregister' | 'api' | 'info'

export interface LogEntry {
  seq: number
  time: number
  level: LogLevel
  text: string
}

export interface ToolLogInfo {
  id: string
  label: string
}

const TAG = '%c[HueZ]%c'
const TAG_STYLE = 'color:#4f8cff;font-weight:bold'
const RESET = 'color:inherit'

const MAX_ENTRIES = 300
const entries: LogEntry[] = []
const listeners = new Set<(entry: LogEntry) => void>()
let seq = 0

function emit(level: LogLevel, text: string): void {
  const entry: LogEntry = { seq: ++seq, time: Date.now(), level, text }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.shift()
  for (const fn of listeners) fn(entry)
  console.info(TAG + ' ' + text, TAG_STYLE, RESET)
}

/** Subscribe to the live log stream. Returns an unsubscribe function. */
export function subscribeLogs(fn: (entry: LogEntry) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Snapshot of buffered entries (for late-joining UI). */
export function getLogs(): readonly LogEntry[] {
  return entries
}

export function logToolRegistered(tool: ToolLogInfo): void {
  emit('register', `+ tool registered: ${tool.id} — ${tool.label}`)
}

export function logToolActivated(tool: ToolLogInfo): void {
  emit('activate', `→ tool activated: ${tool.id}`)
}

export function logToolUnregistered(tool: ToolLogInfo): void {
  emit('unregister', `− tool unregistered: ${tool.id}`)
}

/** Record an endpoint / API invocation, e.g. `shape:rectangle.onPointerDown`. */
export function logApiCall(endpoint: string, detail?: string): void {
  emit('api', `⚡ ${endpoint}${detail ? ` — ${detail}` : ''}`)
}

export function logInfo(text: string): void {
  emit('info', text)
}

/** Flush the buffered history (used by the Activity panel "clear" action). */
export function clearLogs(): void {
  entries.length = 0
  for (const fn of listeners)
    fn({ seq: ++seq, time: Date.now(), level: 'info', text: '— log cleared —' })
}
