import { useCallback, useMemo, type ComponentType, type ReactNode } from 'react'
import type { WorkspaceBrowserProps, DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { PropsHooks, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PickerInjected } from './WorkspaceChatPicker.tsx'
import { WorkspaceChatPicker } from './WorkspaceChatPicker.tsx'
import { groupId, groupedSnapshot, type ChatGroup } from './grouping.ts'
import { en, ja, zh, type ChatKey } from './locales.ts'

export type GroupBrowserExtra = {
  NativeBrowser: ComponentType<WorkspaceBrowserProps>
  directory: Omit<PickerInjected, 'hooks'>
  startChat(): void
  renameGroup(title: string): Promise<void>
  refreshGroup(): Promise<void>
  hooks: { chatGroup: HostObservable<ChatGroup | undefined>; chatLanguage: HostObservable<string> }
}
type LegacySessionOrdering = {
  insertSessionBefore?(workspaceId: WorkspaceId, sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>
}
export type GroupBrowserProps = WorkspaceBrowserProps & LegacySessionOrdering & Omit<GroupBrowserExtra, 'hooks'> & PropsHooks<GroupBrowserExtra['hooks']>

/** Decorate the registered stock browser through its public props contract.
 * Only this component's read projection is grouped; domain snapshots stay real. */
export function GroupedWorkspaceBrowser(props: GroupBrowserProps) {
  const group = props.useChatGroup(value => value)
  const raw = props.useWorkspaces(value => value)
  const language = props.useChatLanguage(value => value)
  const projected = useMemo(() => groupedSnapshot(raw, group), [raw, group])
  const useWorkspaces: WorkspaceBrowserProps['useWorkspaces'] = useCallback(select => select(projected), [projected])
  const dictionary = language.startsWith('ja') ? ja : language.startsWith('zh') ? zh : en
  const tChat = (key: string) => dictionary[key as ChatKey] ?? key
  const id = group && groupId(group)
  const members = () => raw.items.filter(row => group?.workspaceIds.includes(row.workspaceId))
  const first = () => members()[0]?.workspaceId
  const Native = props.NativeBrowser
  const insertSessionBefore = props.insertSessionBefore
  // The wrapper inherits the native child declarations at registration time;
  // forward newer child slots without treating them as directory flows.
  const renderHostSlot = props.renderSlot as unknown as (slot: string, owner: unknown, options?: unknown) => ReactNode
  // Newer DSH owns session ordering entirely in the native viewing store.
  const legacyOrdering = insertSessionBefore ? {
    insertSessionBefore: async (workspaceId: WorkspaceId, sessionId: SessionId, beforeSessionId?: SessionId) => {
      // Cross-cwd membership is never fabricated in the Host registry.
      if (id && workspaceId === id) return
      await insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
  } : {}
  return <Native {...props} {...legacyOrdering} useWorkspaces={useWorkspaces}
    startSession={workspaceId => { if (id && workspaceId === id) props.startChat(); else props.startSession(workspaceId) }}
    renameWorkspace={async (workspaceId, title) => {
      if (id && workspaceId === id) await props.renameGroup(title)
      else await props.renameWorkspace(workspaceId, title)
    }}
    deleteWorkspace={async workspaceId => {
      try {
        if (id && workspaceId === id) {
          // Capture the visible group's members once. New chats created during
          // deletion are not included; a partial failure leaves the rest visible.
          for (const member of members()) await props.deleteWorkspace(member.workspaceId)
        } else await props.deleteWorkspace(workspaceId)
      } finally { await props.refreshGroup() }
    }}
    insertWorkspaceBefore={async (workspaceId, beforeWorkspaceId) => {
      const anchor = beforeWorkspaceId === id ? first() : beforeWorkspaceId
      if (id && workspaceId === id) {
        for (const member of members()) await props.insertWorkspaceBefore(member.workspaceId, anchor)
      } else await props.insertWorkspaceBefore(workspaceId, anchor)
    }}
    renderSlot={(slot, input, options) => {
      if (slot !== 'sidebar.workspaces.directoryFlow') return renderHostSlot(slot, input, options)
      const owner = input as unknown as DirectoryFlowOwnerProps
      return <WorkspaceChatPicker {...props.directory}
        {...props} t={tChat} directoryOnly externalBusy={owner.busy} open={owner.open} onClose={owner.onCancel}
        onDirectoryPicked={owner.onPicked} onPick={() => {}} selectedId={undefined}
        useCreation={select => select({ phase: 'idle', pending: false, supported: true })}
        useWorkspaceNavigation={props.useSessions}
        // Directory adoption is still owned by the native sidebar's flow.
        createWorkspace={props.createWorkspace as (input: { path: string }) => Promise<WorkspaceView>} />
    }}
  />
}
