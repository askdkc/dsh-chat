import { defineConfig } from 'vitest/config'
export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], testTimeout: 20000 } })
