import Dexie, { Table } from 'dexie'
import { v4 as uuidv4 } from 'uuid'

import * as sqlite from './sqlite'
import { KnowledgeBase, KBChunk } from './types'

// --- IndexedDB fallback ---

class KBDB extends Dexie {
  kbs!: Table<KnowledgeBase>
  chunks!: Table<KBChunk>

  constructor() {
    super('flow-kb')
    this.version(1).stores({
      kbs: 'id, name, createdAt, chunkCount, enabled',
      chunks: 'id, kbId, pageNumber',
    })
  }
}

const kbDb = new KBDB()

// --- Storage routing ---

let _useSQLite = false

export async function initStorage(): Promise<boolean> {
  _useSQLite = await sqlite.tryInit()
  return _useSQLite
}

export function usingSQLite(): boolean {
  return _useSQLite
}

export async function switchToSQLite(): Promise<string> {
  const path = await sqlite.pickFolder()
  _useSQLite = true
  return path
}

export function getDisplayPath(): string {
  return sqlite.getDisplayPath()
}

export async function reconnectFolder(): Promise<string | null> {
  const path = await sqlite.reconnectFolder()
  if (path) _useSQLite = true
  return path
}

// --- Unified API (routes to active backend) ---

export async function getAllKBs(): Promise<KnowledgeBase[]> {
  if (_useSQLite) return sqlite.getAllKBs()
  return kbDb.kbs.orderBy('createdAt').reverse().toArray()
}

export async function getEnabledKBs(): Promise<KnowledgeBase[]> {
  if (_useSQLite) return sqlite.getEnabledKBs()
  return kbDb.kbs.where('enabled').equals(1).toArray()
}

export async function addKB(name: string): Promise<string> {
  if (_useSQLite) return sqlite.addKB(name)
  const id = uuidv4()
  await kbDb.kbs.add({
    id,
    name,
    createdAt: Date.now(),
    chunkCount: 0,
    enabled: true,
  })
  return id
}

export async function bulkAddChunks(
  chunks: KBChunk[],
  kbId: string,
): Promise<void> {
  if (_useSQLite) {
    await sqlite.bulkAddChunks(chunks, kbId)
    return
  }
  await kbDb.chunks.bulkAdd(chunks)
  await kbDb.kbs.update(kbId, { chunkCount: chunks.length })
}

export async function deleteKB(kbId: string): Promise<void> {
  if (_useSQLite) {
    await sqlite.deleteKB(kbId)
    return
  }
  await kbDb.chunks.where('kbId').equals(kbId).delete()
  await kbDb.kbs.delete(kbId)
}

export async function renameKB(kbId: string, name: string): Promise<void> {
  if (_useSQLite) {
    await sqlite.renameKB(kbId, name)
    return
  }
  await kbDb.kbs.update(kbId, { name })
}

export async function toggleKB(kbId: string, enabled: boolean): Promise<void> {
  if (_useSQLite) {
    await sqlite.toggleKB(kbId, enabled)
    return
  }
  await kbDb.kbs.update(kbId, { enabled })
}

export async function getChunksByKB(kbId: string): Promise<KBChunk[]> {
  if (_useSQLite) return sqlite.getChunksByKB(kbId)
  return kbDb.chunks.where('kbId').equals(kbId).toArray()
}

export async function getAllEnabledChunks(): Promise<KBChunk[]> {
  if (_useSQLite) return sqlite.getAllEnabledChunks()
  const enabledKBs = await getEnabledKBs()
  const chunkArrays = await Promise.all(
    enabledKBs.map((kb) => getChunksByKB(kb.id)),
  )
  return chunkArrays.flat()
}
