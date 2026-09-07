import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { text as stylesheet } from './RegularChatButton.module.css'
import { text as pickerStyles } from './WorkspaceChatPicker.module.css'
import { WorkspaceChatPicker, type PickerInjected } from './WorkspaceChatPicker.tsx'
import { directoryResult } from './directory.ts'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CreationController } from './controller.ts'
import { createApi } from './rpc.ts'
import { registerJapanese } from './language.ts'
import { RegularChatButton, type ButtonInjected } from './RegularChatButton.tsx'
import { en, ja, zh, type ChatKey } from './locales.ts'
import { createGrouping } from './grouping.ts'
import { GroupedWorkspaceBrowser, type GroupBrowserExtra } from './GroupedWorkspaceBrowser.tsx'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceBrowserInjected } from '@deepseek-ai/dsh-client-ui-workspace/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'regular-chat': ChatKey }
}
export const inject = ['slots', 'locale', 'connection', 'sessions', 'workspaces', 'uiWorkspace', 'remote', 'remote.directoryPicker']
/** Both surfaces share one intent and one navigation owner for this client lifetime. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-regular-chat'
    style.textContent = stylesheet + '\n' + pickerStyles
    document.head.append(style)
    return () => style.remove()
  }, 'regular-chat: styles')
  ctx.effect(() => registerJapanese(ctx.locale), 'regular-chat: Japanese language')
  ctx.effect(() => ctx.locale.register('regular-chat', { en, zh }), 'regular-chat: dictionaries')
  ctx.effect(() => ctx.locale.register('regular-chat', 'ja', ja), 'regular-chat: Japanese dictionary')
  const connection = ctx.get('connection') as ConnectionHandle
  const api = createApi(connection.rpc)
  const grouping = createGrouping(api, ctx.workspaces.list)
  ctx.effect(() => () => grouping.dispose(), 'regular-chat: grouping')
  ctx.on('connection/reset', grouping.reset)
  void grouping.refresh()
  const controller = new CreationController(api, ctx.sessions, ctx.workspaces.list, () => {
    const language = ctx.locale.getSnapshot().active.split('-')[0]
    return language === 'ja' || language === 'zh' ? language : 'en'
  }, {
    getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value), removeItem: key => sessionStorage.removeItem(key),
  })
  ctx.effect(() => () => controller.dispose(), 'regular-chat: controller')
  ctx.effect(() => controller.creationState.subscribe(() => { void grouping.refresh() }), 'regular-chat: grouping refresh')
  const face = (label: 'start' | 'new'): ButtonInjected => ({
    label, start: () => { void controller.start() }, retry: () => { void controller.retry() },
    openCreated: () => controller.openCreated(), hooks: { creation: controller.creationState },
  })
  // Use the public stored registration's component, store and action face.
  // Never import the native browser's private source or mutate its entry.
  ctx.slots.inject('sidebar.workspaces', () => {
    let source: StoredEntry | undefined
    let remove: (() => void) | undefined
    const reconcile = () => {
      const next = ctx.slots.entries('sidebar.workspaces').find(entry =>
        entry.locale === 'workspace' && entry.children?.['sidebar.workspaces.directoryFlow'] && entry.inject && entry.store)
      if (next === source) return
      source = next
      remove?.(); remove = undefined
      if (!next) return
      const native = next
      const inject = (): WorkspaceBrowserInjected & GroupBrowserExtra => {
        const original = native.inject!() as WorkspaceBrowserInjected
        return { ...original,
          NativeBrowser: native.component as GroupBrowserExtra['NativeBrowser'],
          directory: { ...face('start'), createWorkspace: input => ctx.workspaces.create(input),
            listDirectory: async (path, signal) => directoryResult(await ctx.remote.directoryPicker.list(path, signal)),
            createDirectory: (path, name) => ctx.uiWorkspace.createDirectory(path, name), pickDirectory: () => ctx.uiWorkspace.pickDirectory() },
          startChat: () => { void controller.start() }, renameGroup: grouping.rename, refreshGroup: grouping.refresh,
          hooks: { ...original.hooks, chatGroup: grouping.source,
            chatLanguage: { getSnapshot: () => ctx.locale.getSnapshot().active, subscribe: listener => ctx.locale.subscribe(listener) } },
        }
      }
      // StoredEntry is deliberately type-erased by the public Slot registry.
      // Preserve its store seat while registering our typed adapter at this boundary.
      const register = ctx.slots.register as (options: object, component: unknown) => () => void
      remove = register.call(ctx.slots, { name: 'sidebar.workspaces', priority: -100, store: native.store, locale: 'workspace', inject }, GroupedWorkspaceBrowser)
    }
    const unsubscribe = ctx.slots.subscribe('sidebar.workspaces', reconcile)
    reconcile()
    return () => { unsubscribe(); remove?.() }
  })
  ctx.slots.inject('conversation.hero.workspace', () => {
    const injected = (): PickerInjected => ({
      ...face('start'),
      hooks: { ...face('start').hooks, workspaceNavigation: ctx.sessions.list },
      createWorkspace: input => ctx.workspaces.create(input),
      listDirectory: async (path, signal) => directoryResult(await ctx.remote.directoryPicker.list(path, signal)),
      createDirectory: (path, name) => ctx.uiWorkspace.createDirectory(path, name),
      pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
    })
    const remove = ctx.slots.register({ name: 'conversation.hero.workspace', priority: -100, locale: 'regular-chat', inject: injected }, WorkspaceChatPicker)
    const updateSupport = () => controller.setSupported(ctx.slots.entriesOfSlot('conversation.hero.workspace')[0]?.component === WorkspaceChatPicker)
    const unsubscribe = ctx.slots.subscribe('conversation.hero.workspace', updateSupport)
    updateSupport()
    return () => { unsubscribe(); remove(); controller.setSupported(false) }
  })
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: 'regular-chat-status', order: 100, locale: 'regular-chat', inject: () => face('start') }, RegularChatButton))
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'regular-chat-new', order: 10, locale: 'regular-chat', inject: () => face('new') }, RegularChatButton))
}
