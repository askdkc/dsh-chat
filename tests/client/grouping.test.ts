import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { groupedSnapshot } from '../../src/client/grouping.ts'

it('merges owned rows into one group without changing real snapshots, archived state or unrelated projects', () => {
  const row = (id: string, sessions: string[]) => ({ workspaceId: id, title: `Regular Chat ${id}`, path: `/independent/${id}`, sessionIds: sessions, createdAt: '', updatedAt: '' })
  const snapshot = { items: [row('project', ['outside']), row('a', ['one']), row('b', ['two'])], archivedSessionIds: ['archived'], phase: 'ready', state: 'idle', error: null } as unknown as WorkspaceSnapshot
  const group = { scopeKey: 'scope', title: 'Regular Chat', workspaceIds: ['a', 'b'] }
  const result = groupedSnapshot(snapshot, group)
  expect(result.items).toHaveLength(2)
  expect(result.items[0]).toBe(snapshot.items[0])
  expect(result.items[1]).toMatchObject({ workspaceId: 'a', title: 'Regular Chat', sessionIds: ['one', 'two'] })
  expect(result.archivedSessionIds).toBe(snapshot.archivedSessionIds)
  expect(snapshot.items).toHaveLength(3)
  expect(groupedSnapshot({ ...snapshot, items: [snapshot.items[0]!] }, group).items).toHaveLength(1)
})

it('anchors native workspace actions to the first live member, not stale or reordered group IDs', () => {
  const snapshot = { items: [
    { workspaceId: 'b', title: 'Backing B', sessionIds: ['two'] },
    { workspaceId: 'a', title: 'Backing A', sessionIds: ['one'] },
  ], archivedSessionIds: [] } as unknown as WorkspaceSnapshot
  const group = { scopeKey: 'scope', title: 'Chat collection', workspaceIds: ['removed', 'a', 'b'] }
  const result = groupedSnapshot(snapshot, group)
  expect(result.items).toHaveLength(1)
  expect(result.items[0]).toMatchObject({ workspaceId: 'b', title: 'Chat collection', sessionIds: ['two', 'one'] })
  expect(snapshot.items[0]!.title).toBe('Backing B')
})
