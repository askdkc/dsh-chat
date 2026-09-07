import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RegularChatButton, type ButtonProps } from '../../src/client/RegularChatButton.tsx'
import { en, ja, zh } from '../../src/client/locales.ts'
import type { CreationState } from '../../src/client/controller.ts'
function render(dictionary: typeof en, state: CreationState) {
  const props = {
    useCreation: (select: (state: CreationState) => unknown) => select(state),
    start: vi.fn(), retry: vi.fn(), openCreated: vi.fn(), label: 'start',
    t: (key: keyof typeof en) => dictionary[key],
  } as ButtonProps
  return renderToStaticMarkup(<RegularChatButton {...props} />)
}
for (const [language, dictionary] of Object.entries({ en, ja, zh })) {
  it(`${language}: exposes unsupported DSH instead of silently waiting for a slot`, () => {
    const html = render(dictionary, { phase: 'idle', pending: false, supported: false })
    expect(html).toContain('role="alert"')
    expect(html).toContain(dictionary.unsupported)
    expect(html).toContain('disabled=""')
  })
  it(`${language}: localizes busy, retry and delayed-navigation actions`, () => {
    expect(render(dictionary, { phase: 'creating', pending: true, supported: true })).toContain(dictionary.creating)
    const html = render(dictionary, { phase: 'failed', pending: true, supported: true, error: 'storage-unavailable', openSessionId: 'session-created' })
    expect(html).toContain(dictionary.retry)
    expect(html).toContain(dictionary.storageUnavailable)
    expect(html).toContain(dictionary.openCreated)
  })
}
