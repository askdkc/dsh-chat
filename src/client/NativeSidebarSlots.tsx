import { createElement, useMemo, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import type { HostObservable, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'

/** The native sidebar retains these child declarations while our view shadows it. */
export type NativeSidebarSlots = {
  entries(key: string): readonly StoredEntry[]
  entriesOfSlot(key: string): readonly StoredEntry[]
  subscribe(key: string, listener: () => void): () => void
}

type Translate = (key: string, params?: Record<string, unknown>) => string
type ChildProps = Record<string, unknown>

function selectorHook(source: HostObservable<unknown>) {
  return (select: (snapshot: unknown) => unknown) =>
    select(useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot))
}

function NativeSidebarEntry({ entry, owner, options, inherited, translate }: {
  entry: StoredEntry
  owner: ChildProps
  options?: { hookContext?: unknown }
  inherited: ChildProps
  translate: (namespace: string) => Translate
}) {
  // Match the renderer's registration-lifetime inject semantics. The shipped
  // menu actions own their Host operations and state sources; do not copy them.
  const injected = useMemo(() => (entry.inject?.() ?? {}) as ChildProps, [entry])
  const hooks = (injected.hooks ?? {}) as Record<string, HostObservable<unknown>>
  const boundHooks = useMemo(() => Object.fromEntries(Object.entries(hooks).map(([name, source]) =>
    [`use${name[0]!.toUpperCase()}${name.slice(1)}`, selectorHook(source)])), [injected])
  const Component = entry.component as ComponentType<ChildProps>
  return createElement(Component, {
    ...inherited,
    ...owner,
    ...injected,
    ...boundHooks,
    useMenuOpenState: () => options?.hookContext,
    t: entry.locale ? translate(entry.locale) : inherited.t,
  })
}

/** Render native session actions without claiming their already owned slots. */
export function NativeSidebarSlot({ slot, owner, options, slots, inherited, translate }: {
  slot: string
  owner: unknown
  options?: unknown
  slots: NativeSidebarSlots
  inherited: ChildProps
  translate: (namespace: string) => Translate
}): ReactNode {
  useSyncExternalStore(
    listener => slots.subscribe(slot, listener),
    () => slots.entries(slot),
    () => slots.entries(slot),
  )
  return slots.entriesOfSlot(slot).map((entry, index) =>
    <NativeSidebarEntry key={`${entry.options.id ?? index}:${entry.options.priority ?? 0}`}
      entry={entry} owner={owner as ChildProps} options={options as { hookContext?: unknown } | undefined}
      inherited={inherited} translate={translate} />)
}
