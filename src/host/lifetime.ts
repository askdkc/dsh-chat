import { ChatError } from './errors.ts'

/** Cache a successful service, but let an explicit request retry failed startup. */
export function serviceLifetime<T extends { dispose(): Promise<void> }>(create: () => Promise<T>) {
  let pending: Promise<T> | undefined
  let closed = false
  return {
    get(): Promise<T> {
      if (closed) return Promise.reject(new ChatError('cancelled'))
      if (!pending) {
        const attempt = Promise.resolve().then(create)
        pending = attempt
        void attempt.catch(() => { if (pending === attempt) pending = undefined })
      }
      return pending
    },
    async dispose(): Promise<void> {
      closed = true
      const service = await pending?.catch(() => undefined)
      await service?.dispose()
    },
  }
}
