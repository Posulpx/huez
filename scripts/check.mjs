#!/usr/bin/env zx
// HueZ check — full verification gate (typecheck + fmt + build smoke)
// Mirrors zx's `npm test` philosophy: one zx entrypoint for CI.

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

console.log('▶ typecheck')
await $`npx tsc --noEmit`

console.log('▶ fmt:check')
await $`npx prettier --check .`

console.log('✓ all checks passed')
