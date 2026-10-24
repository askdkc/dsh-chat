/** Keyless provider used only by the integration profile; never included in the npm payload. */
import { LlmAdapter, type GenerateOptions, type StreamChunk, type ToolCallBlock } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
export const inject = ['llm']
class LocalTestModel extends LlmAdapter {
  private sentStatus = false
  override async listModels(provider: string) { return [{ provider, id: 'local-test', name: 'Local Test Model' }] }
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: 'Local Test Model', contextWindow: 64000 } }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    options.signal?.throwIfAborted()
    if (process.env.DSH_TEST_KIOKUKO_TARBALL && !this.sentStatus) {
      if (!options.tools?.some(tool => tool.name === 'lisp_status')) throw Error('Active Lisp must present lisp_status to the model')
      this.sentStatus = true
      const call = { type: 'tool-call' as const, id: 'integration-lisp-status' as ToolCallBlock['id'], name: 'lisp_status', arguments: '{}' }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: call }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = 'Regular chat integration response.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 6 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
export function apply(ctx: Context) {
  ctx.effect(() => ctx.llm.registerAdapter(['regular-chat-test'], new LocalTestModel()), 'regular-chat-test: model')
}
