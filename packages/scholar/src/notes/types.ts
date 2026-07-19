export type ReadingStatus = "to_read" | "reading" | "read"

/** 笔记的结构化元数据,持久化为 markdown 文件的 YAML frontmatter。 */
export interface NoteMeta {
  paperId: string
  title: string
  status: ReadingStatus
  year?: number
  authors?: string[]
  tags?: string[]
  /** 一句话论点——NOTES.md 索引里代表这篇论文的那一行。 */
  thesis?: string
  updatedAt: string
}

export interface NoteInput {
  paperId: string
  title?: string
  status?: ReadingStatus
  year?: number
  authors?: string[]
  tags?: string[]
  thesis?: string
  /** 提供时整体替换正文;省略时保留已有正文(仅更新元数据)。 */
  body?: string
}

export interface NoteRecord extends NoteMeta {
  body: string
  path: string
}
