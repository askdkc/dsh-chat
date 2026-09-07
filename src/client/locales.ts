export const en = {
  start: 'Regular Chat', new: 'New Regular Chat', description: 'Start chatting without choosing a project.',
  storageHint: 'Files are saved in a directory dedicated to this chat.', creating: 'Creating…', synchronizing: 'Preparing the chat…',
  retry: 'Retry', openCreated: 'Open the created chat', ready: 'Chat created.', failed: 'Could not create the chat.',
  disconnected: 'Check the connection and retry.', recoveryRequired: 'The partially created chat needs review.',
  unsupported: 'This DSH build lacks the central chat action extension point.', storageUnavailable: 'The chat storage directory is unavailable.',
  scopeChanged: 'The connected chat storage area has changed.', workspaceTitle: 'Regular Chat {id}',
}
export type ChatKey = keyof typeof en
export const ja: Record<ChatKey, string> = {
  start: '通常チャット', new: '新しい通常チャット', description: 'プロジェクトを選ばずに会話を始めます。',
  storageHint: 'ファイルはこのチャット専用の場所に保存されます。', creating: '作成中…', synchronizing: 'チャットを準備中…',
  retry: '再試行', openCreated: '作成したチャットを開く', ready: 'チャットを作成しました。', failed: 'チャットを作成できませんでした。',
  disconnected: '接続を確認して再試行してください。', recoveryRequired: '作成途中のチャットを確認する必要があります。',
  unsupported: 'このDSHには中央チャット操作の拡張枠がありません。', storageUnavailable: 'チャットの保存先を利用できません。',
  scopeChanged: '接続先のチャット保存領域が変更されています。', workspaceTitle: '通常チャット {id}',
}
export const zh: Record<ChatKey, string> = {
  start: '普通聊天', new: '新建普通聊天', description: '无需选择项目即可开始聊天。',
  storageHint: '文件将保存到此聊天专用的目录。', creating: '正在创建…', synchronizing: '正在准备聊天…',
  retry: '重试', openCreated: '打开已创建的聊天', ready: '聊天已创建。', failed: '无法创建聊天。',
  disconnected: '请检查连接后重试。', recoveryRequired: '需要检查尚未完成创建的聊天。',
  unsupported: '此 DSH 版本缺少中央聊天操作扩展点。', storageUnavailable: '无法使用聊天存储目录。',
  scopeChanged: '当前连接的聊天存储区域已更改。', workspaceTitle: '普通聊天 {id}',
}
