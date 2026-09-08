import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { RegularChatButton, type ButtonInjected } from './RegularChatButton.tsx'
import css from './WorkspaceChatPicker.module.css'
import { NativeDirectoryPickerRequired } from './directory.ts'

export type PickerInjected = Omit<ButtonInjected, 'hooks'> & {
  hooks: ButtonInjected['hooks'] & { workspaceNavigation: ISessions['list'] }
  createWorkspace: IWorkspaces['create']
  listDirectory: UiWorkspace['listDirectory']
  createDirectory: UiWorkspace['createDirectory']
  pickDirectory: UiWorkspace['pickDirectory']
}
export type PickerProps = PropsRuntime<'conversation.hero.workspace'> & PropsLocale<'regular-chat'> & InjectFace<PickerInjected> & {
  directoryOnly?: boolean
  externalBusy?: boolean
  onDirectoryPicked?: (path: string) => void
}

/** A stock Hero occupant. The parent still owns its Workspace chip and selection.
 * No private component import, child-slot redeclaration, or DSH source patch. */
export function WorkspaceChatPicker(props: PickerProps) {
  const { open, onClose, onPick, selectedId, useWorkspaces, t } = props
  const snapshot = useWorkspaces(state => state)
  const navigation = props.useWorkspaceNavigation(state => state.current)
  const previousNavigation = useRef(navigation)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [mode, setMode] = useState<'workspaces' | 'directory'>('workspaces')
  const [listing, setListing] = useState<DirectoryListing>()
  const [path, setPath] = useState('')
  const [folder, setFolder] = useState('')
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mutating, setBusy] = useState(false)
  const busy = mutating || props.externalBusy === true
  const [error, setError] = useState<string>()
  const scan = useRef<AbortController>()
  const generation = useRef(0)
  const locked = useRef(false)
  const owner = useRef(props)
  owner.current = props

  // Invalidating generations prevents chooser/list/create replies from selecting
  // a Workspace after cancellation, navigation, or plugin unload.
  useEffect(() => () => { generation.current++; scan.current?.abort() }, [])
  useEffect(() => {
    if (previousNavigation.current !== navigation && open) {
      generation.current++; scan.current?.abort(); owner.current.onClose()
    }
    previousNavigation.current = navigation
  }, [navigation, open])
  useEffect(() => {
    if (open) {
      setMode('workspaces'); setError(undefined); setLoading(false)
      if (props.directoryOnly) {
        dialog.current?.close()
        void browse()
      } else if (!dialog.current?.open) dialog.current?.showModal()
    } else {
      generation.current++; scan.current?.abort()
      locked.current = false; setBusy(false)
      dialog.current?.close()
    }
  }, [open])

  const close = () => {
    if (locked.current || props.externalBusy) return
    generation.current++; scan.current?.abort()
    onClose()
  }
  const browse = async (target?: string) => {
    if (locked.current) return
    scan.current?.abort()
    const controller = new AbortController()
    scan.current = controller
    const current = generation.current
    setMode('directory'); setLoading(true); setError(undefined)
    try {
      const value = await props.listDirectory(target, controller.signal)
      if (controller.signal.aborted || current !== generation.current) return
      setListing(value); setPath(value.path)
      if (!dialog.current?.open) dialog.current?.showModal()
    } catch (reason) {
      if (!controller.signal.aborted && current === generation.current) {
        if (reason instanceof NativeDirectoryPickerRequired) { setMode('workspaces'); native() }
        else {
          setError(String(reason instanceof Error ? reason.message : reason))
          if (!dialog.current?.open) dialog.current?.showModal()
        }
      }
    } finally {
      if (!controller.signal.aborted && current === generation.current) setLoading(false)
    }
  }
  const mutate = async (operation: (current: () => boolean) => Promise<void>) => {
    if (locked.current || props.externalBusy) return
    locked.current = true; setBusy(true); setError(undefined)
    const epoch = generation.current
    const current = () => epoch === generation.current
    try { await operation(current) }
    catch (reason) {
      if (current()) {
        setError(String(reason instanceof Error ? reason.message : reason))
        if (!dialog.current?.open) dialog.current?.showModal()
      }
    }
    finally { if (current()) { locked.current = false; setBusy(false) } }
  }
  const adopt = async (directory: string, current: () => boolean) => {
    if (!current()) return
    if (owner.current.onDirectoryPicked) { owner.current.onDirectoryPicked(directory); return }
    const workspace = await props.createWorkspace({ path: directory })
    if (current()) { owner.current.onPick(workspace.workspaceId); owner.current.onClose() }
  }
  const createFolder = () => {
    if (!listing || !folder.trim() || loading) return
    void mutate(async current => {
      const created = await props.createDirectory(listing.path, folder.trim())
      if (!current()) return
      const value = await props.listDirectory(created)
      if (current()) { setListing(value); setPath(value.path); setFolder('') }
    })
  }
  const native = () => {
    // The OS chooser owns the visible selection UI until it settles.
    dialog.current?.close()
    void mutate(async current => {
      const directory = await props.pickDirectory()
      if (directory !== null) await adopt(directory, current)
      else if (current()) owner.current.onClose()
    })
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    if (!buttons.length) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    event.preventDefault(); buttons[next]?.focus()
  }
  return <>
    {!props.directoryOnly && <RegularChatButton {...props} />}
    <dialog ref={dialog} className={css.dialog} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); close() }}>
      <h2 id={titleId}>{t(mode === 'workspaces' ? 'chooseWorkspace' : 'chooseDirectory')}</h2>
      {error && <p role="alert" className={css.error}>{t('directoryFailed')} {error}</p>}
      {mode === 'workspaces' ? <>
        {snapshot.phase === 'pending' && <p role="status">{t('loading')}</p>}
        <div className={css.list} role="menu" aria-label={t('chooseWorkspace')} onKeyDown={keyboard}>
          {snapshot.items.map(workspace => <button key={workspace.workspaceId} type="button" role="menuitemradio"
            aria-checked={workspace.workspaceId === selectedId} disabled={busy}
            onClick={() => { if (!locked.current) { onPick(workspace.workspaceId); onClose() } }}>
            {workspace.title}{workspace.workspaceId === selectedId ? ' ✓' : ''}
          </button>)}
        </div>
        <button type="button" disabled={busy} onClick={() => { void browse() }}>{t('addWorkspace')}</button>
      </> : <>
        <form className={css.row} onSubmit={event => { event.preventDefault(); void browse(path) }}>
          <label className={css.path}>{t('directoryPath')}<input value={path} disabled={busy} onChange={event => setPath(event.target.value)} /></label>
          <button type="submit" disabled={busy || !path.trim()}>{t('go')}</button>
        </form>
        <nav className={css.row} aria-label={t('directoryPath')}>
          <button type="button" disabled={busy} onClick={() => { void browse() }}>{t('home')}</button>
          {listing?.crumbs.map(crumb => <button type="button" key={crumb.path} disabled={busy}
            onClick={() => { void browse(crumb.path) }}>{crumb.name}</button>)}
        </nav>
        <label><input type="checkbox" checked={hidden} onChange={event => setHidden(event.target.checked)} /> {t('showHidden')}</label>
        {loading && <p role="status">{t('loading')}</p>}
        <div className={css.list} aria-label={t('chooseDirectory')} onKeyDown={keyboard}>
          {listing?.entries.filter(entry => hidden || !entry.hidden).map(entry => <button type="button" key={entry.path}
            disabled={busy || loading} onClick={() => { void browse(entry.path) }}>{entry.name}</button>)}
        </div>
        {listing?.truncated && <p role="status">{t('truncated')}</p>}
        <form className={css.row} onSubmit={event => { event.preventDefault(); createFolder() }}>
          <label>{t('newFolder')}<input value={folder} disabled={busy || loading || !listing} onChange={event => setFolder(event.target.value)} /></label>
          <button type="submit" disabled={busy || loading || !listing || !folder.trim()}>{t('createFolder')}</button>
        </form>
        <button type="button" disabled={busy || loading || !listing || !!error}
          onClick={() => { if (listing) void mutate(current => adopt(listing.path, current)) }}>{t('useDirectory')}</button>
      </>}
      <footer className={css.row}>
        {mode === 'directory' && !props.directoryOnly && <button type="button" disabled={busy} onClick={() => {
          scan.current?.abort(); setLoading(false); setError(undefined); setMode('workspaces')
        }}>{t('back')}</button>}
        <button type="button" disabled={busy} onClick={close}>{t('cancel')}</button>
      </footer>
    </dialog>
  </>
}
