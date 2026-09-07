interface LanguageCatalog {
  getSnapshot(): { locales: readonly { id: string }[] }
  addLanguage(input: { id: string; label: string; fallback: string }): () => void
  subscribe(listener: () => void): () => void
}
/** Own only our registration; if another language pack unloads, restore Japanese availability. */
export function registerJapanese(locale: LanguageCatalog): () => void {
  let release: (() => void) | undefined
  let active = true
  const ensure = () => {
    if (active && !locale.getSnapshot().locales.some(item => item.id.toLowerCase() === 'ja')) {
      release = locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' })
    }
  }
  ensure()
  const unsubscribe = locale.subscribe(ensure)
  return () => { active = false; unsubscribe(); release?.() }
}
