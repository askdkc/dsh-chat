import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { groupedSnapshot, groupId } from '../../src/client/grouping.ts'

it('merges owned rows into one group without changing real snapshots, archived state or unrelated projects', () => {
  const row = (id: string, sessions: string[]) => ({ workspaceId: id, title: `Regular Chat ${id}`, path: `/independent/${id}`, sessionIds: sessions, createdAt: '', updatedAt: '' })
  const snapshot = { items: [row('project', ['outside']), row('a', ['one']), row('b', ['two'])], archivedSessionIds: ['archived'], phase: 'ready', state: 'idle', error: null } as unknown as WorkspaceSnapshot
  const group = { scopeKey: 'scope', title: 'Regular Chat', workspaceIds: ['a', 'b'] }
  const result = groupedSnapshot(snapshot, group)
  expect(result.items).toHaveLength(2)
  expect(result.items[0]).toBe(snapshot.items[0])
  expect(result.items[1]).toMatchObject({ workspaceId: groupId(group), title: 'Regular Chat', sessionIds: ['one', 'two'] })
  expect(result.archivedSessionIds).toBe(snapshot.archivedSessionIds)
  expect(snapshot.items).toHaveLength(3)
  expect(groupedSnapshot({ ...snapshot, items: [snapshot.items[0]!] }, group).items).toHaveLength(1)
})
