import { describe, expect, it, vi } from 'vitest'
import { registerJapanese } from '../../src/client/language.ts'
import { en, ja, zh } from '../../src/client/locales.ts'
function catalog(existing = false) {
  const locales = [{ id: 'en' }, { id: 'zh' }, ...(existing ? [{ id: 'ja' }] : [])]
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of listeners) listener() }
  return { locales, listeners, notify, getSnapshot: () => ({ locales }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    addLanguage: vi.fn((input: { id: string }) => {
      if (locales.some(l => l.id === input.id)) throw Error('duplicate')
      locales.push(input); notify()
      return () => { const i = locales.indexOf(input); if (i >= 0) locales.splice(i, 1); notify() }
    }),
  }
}
describe('language ownership', () => {
  it('matches all keys and substitution variables', () => {
    for (const dictionary of [ja, zh]) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort())
      for (const key of Object.keys(en) as (keyof typeof en)[]) expect(dictionary[key].match(/\{\w+\}/g)).toEqual(en[key].match(/\{\w+\}/g))
    }
  })
  it('preserves Japanese registered by another language pack', () => {
    const c = catalog(true), dispose = registerJapanese(c)
    dispose(); expect(c.addLanguage).not.toHaveBeenCalled(); expect(c.locales.some(l => l.id === 'ja')).toBe(true)
  })
  it('supports HMR without leaked subscriptions or duplicate entries', () => {
    const c = catalog()
    for (let i = 0; i < 3; i++) {
      const dispose = registerJapanese(c)
      expect(c.locales.filter(l => l.id === 'ja')).toHaveLength(1)
      dispose(); expect(c.locales.filter(l => l.id === 'ja')).toHaveLength(0)
      expect(c.listeners.size).toBe(0)
    }
  })
  it('adopts registration when the previous language pack unloads', () => {
    const c = catalog(true), dispose = registerJapanese(c)
    c.locales.pop(); c.notify()
    expect(c.addLanguage).toHaveBeenCalledTimes(1)
    dispose()
    expect(c.locales.some(l => l.id === 'ja')).toBe(false)
  })
})
