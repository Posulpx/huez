/**
 * Central hotkey registry for HueZ. All current hotkeys are defined here
 * for discoverability and to keep `App` and tools consistent.
 */

export interface Hotkey {
  keys: string
  description: string
  when?: string
}

export const HOTKEYS: Hotkey[] = [
  // Global
  { keys: 'Ctrl/Cmd+Z', description: 'Undo', when: 'global' },
  {
    keys: 'Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y',
    description: 'Redo',
    when: 'global',
  },
  { keys: 'Ctrl/Cmd+C', description: 'Copy selected', when: 'global' },
  {
    keys: 'Ctrl/Cmd+V',
    description: 'Paste (to selected dashboards if any)',
    when: 'global',
  },
  {
    keys: 'Ctrl/Cmd+A',
    description:
      'Select all: artwork-specific if inside active artboard, otherwise free + artboards',
    when: 'global',
  },
  {
    keys: 'Delete / Backspace',
    description: 'Delete selected',
    when: 'global',
  },

  // SelectTool
  { keys: 'Click', description: 'Select element', when: 'SelectTool' },
  {
    keys: 'Shift+Click',
    description: 'Add to selection (same artboard scope)',
    when: 'SelectTool',
  },
  {
    keys: 'Drag on empty',
    description: 'Marquee (Shift adds)',
    when: 'SelectTool',
  },
  {
    keys: 'Drag selected',
    description: 'Move (Shift 45° snap, live artboard reassign by cursor)',
    when: 'SelectTool',
  },
  {
    keys: 'Alt+Drag',
    description: 'Duplicate selection (Figma style)',
    when: 'SelectTool',
  },
  {
    keys: 'Handle drag',
    description: 'Scale (Shift ratio lock, Alt center pivot)',
    when: 'SelectTool',
  },
  {
    keys: 'Rotate handle drag',
    description: 'Rotate (Shift 45° snap)',
    when: 'SelectTool',
  },
  {
    keys: 'Group (2+)',
    description: 'Scale/rotate as one (group bounds)',
    when: 'SelectTool',
  },

  // PenTool
  { keys: 'Click', description: 'Drop corner anchor', when: 'PenTool' },
  {
    keys: 'Click-drag',
    description:
      'Smooth point (Alt straightens In, Ctrl in-curve/out-straight like closing, otherwise symmetrical)',
    when: 'PenTool',
  },
  {
    keys: 'Click first/last anchor',
    description: 'Close path (drag to set entry handle until mouse up)',
    when: 'PenTool',
  },
  {
    keys: 'Hover near endpoint',
    description: 'Highlight open/closing target (orange, skips active origin)',
    when: 'PenTool',
  },
  { keys: 'Enter', description: 'Finish open path', when: 'PenTool' },
  { keys: 'Escape', description: 'Cancel path', when: 'PenTool' },

  // PathEditor (vertex editing)
  {
    keys: 'Double-click path',
    description: 'Enter vertex edit',
    when: 'PathEditor',
  },
  {
    keys: 'Drag anchor/handle',
    description: 'Move anchor/handle (Alt independent, symmetrical alt-drag)',
    when: 'PathEditor',
  },
  { keys: 'Click stroke', description: 'Insert anchor', when: 'PathEditor' },
  {
    keys: 'Double-click anchor',
    description: 'Delete anchor / collapse handles',
    when: 'PathEditor',
  },
  {
    keys: 'Enter / Escape',
    description: 'Commit / cancel edit',
    when: 'PathEditor',
  },

  // Text
  {
    keys: 'Double-click text',
    description: 'Enter in-line edit',
    when: 'TextTool/TextEditor',
  },
  {
    keys: 'Escape / Ctrl+Enter / Blur',
    description: 'Commit text',
    when: 'TextEditor',
  },

  // Boolean
  {
    keys: 'Select 2 closed shapes/paths → Add/Subtract/Intersect',
    description: 'Boolean (left boolean panel next to Workspace)',
    when: 'BooleanPanel',
  },

  // View
  { keys: 'Middle-drag', description: 'Pan viewport', when: 'global' },
  { keys: 'Wheel', description: 'Zoom at cursor', when: 'global' },
]

/** Helper to check if event is Ctrl/Cmd+A */
export function isSelectAll(e: KeyboardEvent): boolean {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const mod = isMac ? e.metaKey : e.ctrlKey
  return mod && e.key.toLowerCase() === 'a'
}
