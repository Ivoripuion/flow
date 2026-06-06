export interface KnowledgeBase {
  id: string
  name: string
  createdAt: number
  chunkCount: number
  enabled: boolean
  tags?: string[]
}

export interface KBChunk {
  id: string
  kbId: string
  pageNumber: number
  text: string
  embedding: Float32Array
}

export type KBChunkData = Omit<KBChunk, 'id' | 'kbId' | 'embedding'>
