import { rmSync } from 'node:fs'

// Only generated plugin output is removed; never reuse declarations from a prior build.
rmSync(new URL('../lib/', import.meta.url), { recursive: true, force: true })
