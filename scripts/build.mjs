#!/usr/bin/env zx
// HueZ build — zx-style script (mirrors google/zx conventions)
// Usage: zx scripts/build.mjs [--no-typecheck]
//   Runs tsc --noEmit then vite build with sensible defaults.

import { $, usePowerShell, useBash } from 'zx'

if (process.platform === 'win32') {
  try {
    usePowerShell()
  } catch {}
} else {
  try {
    useBash()
  } catch {}
}
$.verbose = true

const noTypecheck = process.argv.includes('--no-typecheck')

if (!noTypecheck) {
  await $`npx tsc --noEmit`
}

await $`npx vite build`

console.log('✓ build complete → dist/')
