import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CreationController } from './controller.ts'
import type { ChatKey } from './locales.ts'
import type { ErrorCode } from '../shared/protocol.ts'
import css from './RegularChatButton.module.css'

export type ButtonInjected = {
  start: () => void
  retry: () => void
  openCreated: () => void
  label: 'start' | 'new'
  hooks: { creation: CreationController['creationState'] }
}
export type ButtonProps = InjectFace<ButtonInjected> & PropsLocale<'regular-chat'>
export type HeroButtonProps = PropsRuntime<'conversation.hero.workspace'> & ButtonProps
export type HeaderButtonProps = PropsRuntime<'conversation.session.header.actions'> & ButtonProps
const errors: Record<ErrorCode, ChatKey> = {
  'invalid-request': 'recoveryRequired', 'protocol-mismatch': 'unsupported', 'scope-changed': 'scopeChanged',
  'storage-unavailable': 'storageUnavailable', 'recovery-required': 'recoveryRequired', 'writer-locked': 'writerLocked',
  disconnected: 'disconnected', cancelled: 'disconnected', 'session-not-ready': 'disconnected',
}
export function RegularChatButton({ useCreation, start, retry, openCreated, label, t }: ButtonProps) {
  const state = useCreation(value => value)
  const busy = state.phase === 'creating' || state.phase === 'synchronizing'
  return <div className={css.root} aria-busy={busy}>
    <button type="button" className={css.button} disabled={busy || !state.supported}
      title={`${t('description')} ${t('storageHint')}`}
      onClick={state.pending ? retry : start}>
      {busy ? t(state.phase === 'creating' ? 'creating' : 'synchronizing') : t(state.pending ? 'retry' : label)}
    </button>
    {!state.supported && <span role="alert" className={css.message}>{t('unsupported')}</span>}
    {state.error && <span role="alert" className={css.message}>{t('failed')} {t(errors[state.error])}</span>}
    {state.openSessionId && <button type="button" className={css.button} onClick={openCreated}>{t('openCreated')}</button>}
    {state.phase === 'ready' && <span role="status" className={css.message}>{t('ready')}</span>}
  </div>
}
