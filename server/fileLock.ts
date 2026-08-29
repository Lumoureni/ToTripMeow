/** 进程内按 key 串行化读写，避免并发请求写坏 JSON 文件 */
const chains = new Map<string, Promise<unknown>>()

export function withFileLock<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve()
  const run = prev.then(() => fn())
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run as Promise<T>
}
