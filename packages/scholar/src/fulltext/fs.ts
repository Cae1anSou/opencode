import { dirname, join, resolve } from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

/**
 * 论文存储的根目录，按项目隔离——`projectDir` 是宿主(OpenCode)里当前项目的
 * worktree 路径。同一篇论文在不同项目下各存一份，因为"论文属于哪个项目"是
 * 产品的一等关系，不能靠一个全局池子隐式共享。网络抓取缓存（fulltext/cache.ts）
 * 是另一回事：缓存的是"这篇论文在互联网上的样子"，与项目无关，继续走全局目录。
 */
export function root(projectDir: string) {
  return join(resolve(projectDir), ".research")
}

export function papers(projectDir: string) {
  return join(root(projectDir), "papers")
}

export function rawDir(projectDir: string) {
  return join(papers(projectDir), "raw")
}

export function artifactDir(projectDir: string) {
  return join(papers(projectDir), "artifacts")
}

export async function ensure(projectDir: string) {
  await mkdir(rawDir(projectDir), { recursive: true })
  await mkdir(artifactDir(projectDir), { recursive: true })
}

export async function write(path: string, data: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined)
  await writeFile(path, data)
}
