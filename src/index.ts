import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { endpoints } from './shared/protocol.ts'
import { ChatService } from './host/service.ts'
import { fetchDispatcher } from './host/rpc.ts'

export const name = 'regular-chat'
export const inject = ['connection', 'workspaceRegistry', 'sessionController']
/** Mount only on the authenticated DSH channel; graceful unload retains all chat data. */
export function apply(ctx: Context): void {
  const service = ChatService.create(resolveDshHome(), ctx)
  // Keep a failed initialization observable through info/prepare without an unhandled rejection.
  void service.catch(() => {})
  ctx.effect(() => async () => {
    const ready = await service.catch(() => undefined)
    await ready?.dispose()
  }, 'regular-chat: writer lifetime')
  for (const endpoint of endpoints) {
    ctx.effect(() => ctx.connection.fetch.register({
      path: `/api/${endpoint}`, methods: ['POST'], requestBody: 'buffered',
      fetch: fetchDispatcher(endpoint, service),
    }), `regular-chat: ${endpoint}`)
  }
}
