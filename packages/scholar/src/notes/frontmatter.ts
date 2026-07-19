/**
 * 极简 frontmatter 读写:只支持本模块自己产出的平面结构
 * (string | number | string[]),数组用 JSON 字面量序列化以避免
 * 逗号歧义(作者名可能含逗号)。不是通用 YAML 解析器,也不打算是——
 * 我们同时控制写入端和读取端,引入 YAML 依赖不值得。
 */

export type FrontmatterValue = string | number | string[]

export function serialize(data: Record<string, FrontmatterValue | undefined>): string {
  const lines: string[] = ["---"]
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (Array.isArray(value)) lines.push(`${key}: ${JSON.stringify(value)}`)
    else lines.push(`${key}: ${String(value)}`)
  }
  lines.push("---")
  return lines.join("\n")
}

export function parse(content: string): { data: Record<string, FrontmatterValue>; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { data: {}, body: content }
  const data: Record<string, FrontmatterValue> = {}
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const raw = line.slice(idx + 1).trim()
    if (!key) continue
    if (raw.startsWith("[")) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          data[key] = arr.map((v) => String(v))
          continue
        }
      } catch {
        // fall through: treat as plain string
      }
    }
    const num = Number(raw)
    data[key] = raw !== "" && !Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(raw) ? num : raw
  }
  return { data, body: content.slice(m[0].length) }
}
