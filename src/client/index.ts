import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { text as stylesheet } from './RegularChatButton.module.css'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CreationController } from './controller.ts'
import { createApi } from './rpc.ts'
import { registerJapanese } from './language.ts'
import { RegularChatButton, type ButtonInjected } from './RegularChatButton.tsx'
import { en, ja, zh, type ChatKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'regular-chat': ChatKey }
}
export const inject = ['slots', 'locale', 'connection', 'sessions', 'workspaces']
/** Both surfaces share one intent and one navigation owner for this client lifetime. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-regular-chat'
    style.textContent = stylesheet
    document.head.append(style)
    return () => style.remove()
  }, 'regular-chat: styles')
  ctx.effect(() => registerJapanese(ctx.locale), 'regular-chat: Japanese language')
  ctx.effect(() => ctx.locale.register('regular-chat', { en, zh }), 'regular-chat: dictionaries')
  ctx.effect(() => ctx.locale.register('regular-chat', 'ja', ja), 'regular-chat: Japanese dictionary')
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new CreationController(createApi(connection.rpc), ctx.sessions, ctx.workspaces.list, () => {
    const language = ctx.locale.getSnapshot().active.split('-')[0]
    return language === 'ja' || language === 'zh' ? language : 'en'
  }, {
    getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value), removeItem: key => sessionStorage.removeItem(key),
  })
  ctx.effect(() => () => controller.dispose(), 'regular-chat: controller')
  const face = (label: 'start' | 'new'): ButtonInjected => ({
    label, start: () => { void controller.start() }, retry: () => { void controller.retry() },
    openCreated: () => controller.openCreated(), hooks: { creation: controller.creationState },
  })
  ctx.slots.inject('conversation.hero.actions', () => {
    controller.setSupported(true)
    ctx.effect(() => () => controller.setSupported(false), 'regular-chat: hero support')
    return ctx.slots.register({ name: 'conversation.hero.actions', id: 'regular-chat', order: 10, locale: 'regular-chat', inject: () => face('start') }, RegularChatButton)
  })
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: 'regular-chat-status', order: 100, locale: 'regular-chat', inject: () => face('start') }, RegularChatButton))
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'regular-chat-new', order: 10, locale: 'regular-chat', inject: () => face('new') }, RegularChatButton))
}
