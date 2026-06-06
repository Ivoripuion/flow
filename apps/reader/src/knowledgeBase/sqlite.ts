import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { v4 as uuidv4 } from 'uuid'

import { KnowledgeBase, KBChunk } from './types'

// File System Access API types (not in project's older DOM lib)
interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(opts: {
    mode: 'read' | 'readwrite'
  }): Promise<PermissionState>
  requestPermission(opts: {
    mode: 'read' | 'readwrite'
  }): Promise<PermissionState>
}
interface FileHandle extends FileSystemFileHandle {
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>
    close(): Promise<void>
  }>
}
type AnyDirHandle = DirHandle & FileSystemDirectoryHandle
type AnyFileHandle = FileHandle & FileSystemFileHandle

function toBlob(embedding: Float32Array): Uint8Array {
  // Create a copy of the buffer to avoid detachment issues
  const copy = new Float32Array(embedding.length)
  copy.set(embedding)
  return new Uint8Array(copy.buffer)
}

function toEmbedding(blob: Uint8Array): Float32Array {
  // Slice the buffer to create a new ArrayBuffer for Float32Array
  return new Float32Array(
    blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength),
  )
}

const DB_FILE = 'knowledge.db'
const HANDLE_KEY = 'kb_dir_handle'

let db: Database | null = null
let _displayPath = ''

export function getDisplayPath(): string {
  return _displayPath
}

async function openHandleStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kb_handle_store', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('handles')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const idb = await openHandleStore()
    const handle = await new Promise<any>((resolve) => {
      const tx = idb.transaction('handles', 'readonly')
      const store = tx.objectStore('handles')
      const req = store.get(HANDLE_KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    })
    if (!handle?.handle) return null
    return handle.handle
  } catch {
    return null
  }
}

async function saveStoredHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const idb = await openHandleStore()
  const tx = idb.transaction('handles', 'readwrite')
  const store = tx.objectStore('handles')
  store.put({ handle, displayPath: handle.name }, HANDLE_KEY)
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

function initSQL(): Promise<SqlJsStatic> {
  return initSqlJs({
    locateFile: (file: string) =>
      `https://unpkg.com/sql.js@1.14.1/dist/${file}`,
  })
}

async function readFile(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<Uint8Array | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(name)
    const file = await fileHandle.getFile()
    const buf = await file.arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

async function writeFile(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
  data: Uint8Array,
): Promise<void> {
  const fileHandle = (await dirHandle.getFileHandle(name, {
    create: true,
  })) as AnyFileHandle
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

// Sequential write lock to prevent concurrent saveDB calls from corrupting the file
let _saveLock: Promise<void> = Promise.resolve()

async function saveDB(): Promise<void> {
  if (!db) return

  // Chain saves sequentially; fire-and-forget calls won't overlap with awaited ones
  const lock = _saveLock
  let release: () => void
  _saveLock = new Promise<void>((resolve) => {
    release = resolve
  })

  await lock

  try {
    const handle = await getStoredHandle()
    if (!handle) return
    const data = db.export()
    await writeFile(handle, DB_FILE, data)
  } finally {
    release!()
  }
}

async function createSchema(): Promise<void> {
  if (!db) return
  db.run(`
    CREATE TABLE IF NOT EXISTS kbs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      chunkCount INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      kbId TEXT NOT NULL,
      pageNumber INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      FOREIGN KEY (kbId) REFERENCES kbs(id) ON DELETE CASCADE
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_chunks_kbId ON chunks(kbId)')
}

// --- Public API ---

/**
 * Check if a folder has been selected and a SQLite database is available.
 */
export async function isSQLiteReady(): Promise<boolean> {
  if (db) return true
  const handle = await getStoredHandle()
  if (!handle) return false

  // Verify we still have permission
  const dHandle = handle as AnyDirHandle
  const permission =
    (await dHandle.queryPermission({ mode: 'readwrite' })) === 'granted'
  if (!permission) return false

  return true
}

/**
 * Initialize SQLite storage from a previously saved folder handle.
 * Returns true if successfully initialized, false if fallback needed.
 */
export async function tryInit(): Promise<boolean> {
  if (db) {
    console.log('[KB] SQLite already initialized')
    return true
  }

  const handle = await getStoredHandle()
  if (!handle) {
    console.log(
      '[KB] No stored folder handle found (first run or storage cleared)',
    )
    return false
  }

  // Set display path early so UI knows a handle exists even if permission fails
  _displayPath = handle.name

  try {
    const dHandle = handle as AnyDirHandle
    const permission =
      (await dHandle.queryPermission({ mode: 'readwrite' })) === 'granted'
    if (!permission) {
      console.log(
        '[KB] Folder permission not granted (browser may need re-authorization)',
      )
      return false
    }

    const SQL = await initSQL()
    console.log('[KB] sql.js WASM loaded')

    const existingData = await readFile(handle, DB_FILE)
    if (existingData) {
      db = new SQL.Database(existingData)
      console.log(`[KB] Loaded knowledge.db (${existingData.length} bytes)`)
    } else {
      db = new SQL.Database()
      await createSchema()
      await saveDB()
      console.log('[KB] Created new knowledge.db')
    }
    return true
  } catch (err) {
    console.error('[KB] init error:', err)
    return false
  }
}

/**
 * Pick a folder and initialize SQLite storage there.
 * Must be called from a user gesture (click handler).
 */
/**
 * Re-authorize an existing folder handle (e.g., after browser restart).
 * Must be called from a user gesture (click handler).
 */
export async function reconnectFolder(): Promise<string | null> {
  if (db) return _displayPath

  const handle = await getStoredHandle()
  if (!handle) return null

  try {
    const dHandle = handle as AnyDirHandle
    const permission =
      (await dHandle.requestPermission({ mode: 'readwrite' })) === 'granted'
    if (!permission) return null

    _displayPath = handle.name

    const SQL = await initSQL()
    const existingData = await readFile(handle, DB_FILE)
    if (existingData) {
      db = new SQL.Database(existingData)
      console.log(
        `[KB] Reconnected, loaded knowledge.db (${existingData.length} bytes)`,
      )
    } else {
      db = new SQL.Database()
      await createSchema()
      await saveDB()
      console.log('[KB] Reconnected, created new knowledge.db')
    }
    return handle.name
  } catch (err) {
    console.error('[KB] reconnect error:', err)
    return null
  }
}

export async function pickFolder(): Promise<string> {
  try {
    const rawHandle = await (
      window as typeof window & {
        showDirectoryPicker(opts: { mode: 'readwrite' }): Promise<AnyDirHandle>
      }
    ).showDirectoryPicker({ mode: 'readwrite' })

    const handle = rawHandle as AnyDirHandle

    // Verify write permission for this tab
    const permission =
      (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
    if (!permission) {
      throw new Error('Folder permission denied')
    }

    await saveStoredHandle(handle)
    _displayPath = handle.name

    const SQL = await initSQL()
    db = new SQL.Database()
    await createSchema()
    await saveDB()

    return handle.name
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') {
      throw new Error('Folder selection cancelled')
    }
    throw err
  }
}

export async function getAllKBs(): Promise<KnowledgeBase[]> {
  if (!db) return []
  const stmt = db.prepare(
    'SELECT id, name, createdAt, chunkCount, enabled FROM kbs ORDER BY createdAt DESC',
  )
  const results: KnowledgeBase[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    results.push({
      id: row.id as string,
      name: row.name as string,
      createdAt: row.createdAt as number,
      chunkCount: row.chunkCount as number,
      enabled: (row.enabled as number) === 1,
    })
  }
  stmt.free()
  return results
}

export async function getEnabledKBs(): Promise<KnowledgeBase[]> {
  const all = await getAllKBs()
  return all.filter((kb) => kb.enabled)
}

export async function addKB(name: string): Promise<string> {
  await tryInit()
  if (!db) throw new Error('No storage available')

  const id = uuidv4()
  db.run(
    'INSERT INTO kbs (id, name, createdAt, chunkCount, enabled) VALUES (?, ?, ?, 0, 1)',
    [id, name, Date.now()],
  )
  await saveDB()
  return id
}

export async function bulkAddChunks(
  chunks: KBChunk[],
  kbId: string,
): Promise<void> {
  if (!db) throw new Error('No storage available')

  const insertStmt = db.prepare(
    'INSERT INTO chunks (id, kbId, pageNumber, text, embedding) VALUES (?, ?, ?, ?, ?)',
  )
  for (const chunk of chunks) {
    insertStmt.run([
      chunk.id,
      chunk.kbId!,
      chunk.pageNumber,
      chunk.text,
      toBlob(chunk.embedding),
    ])
  }
  insertStmt.free()

  db.run('UPDATE kbs SET chunkCount = ? WHERE id = ?', [chunks.length, kbId])
  await saveDB()
}

export async function deleteKB(kbId: string): Promise<void> {
  if (!db) return
  db.run('DELETE FROM chunks WHERE kbId = ?', [kbId])
  db.run('DELETE FROM kbs WHERE id = ?', [kbId])
  await saveDB()
}

export async function renameKB(kbId: string, name: string): Promise<void> {
  if (!db) return
  db.run('UPDATE kbs SET name = ? WHERE id = ?', [name, kbId])
  await saveDB()
}

export async function toggleKB(kbId: string, enabled: boolean): Promise<void> {
  if (!db) return
  db.run('UPDATE kbs SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, kbId])
  // Fire-and-forget: don't block UI on writing the full DB to disk
  saveDB().catch(console.error)
}

export async function getChunksByKB(kbId: string): Promise<KBChunk[]> {
  if (!db) return []
  const stmt = db.prepare(
    'SELECT id, kbId, pageNumber, text, embedding FROM chunks WHERE kbId = ?',
    [kbId],
  )
  const results: KBChunk[] = []
  while (stmt.step()) {
    try {
      const row = stmt.get()
      // Validate row data
      if (!row || row.length < 5) {
        console.warn('[KB] Skipping invalid row:', row)
        continue
      }
      const id = row[0]
      const kbIdVal = row[1]
      const pageNumber = row[2]
      const text = row[3]
      const embeddingBlob = row[4]

      // Validate text is a string
      if (typeof text !== 'string' || !text) {
        console.warn('[KB] Skipping chunk with invalid text:', {
          id,
          text: typeof text,
        })
        continue
      }

      // Validate and convert embedding using the fixed toEmbedding function
      if (!(embeddingBlob instanceof Uint8Array)) {
        console.warn('[KB] Skipping chunk with invalid embedding type:', {
          id,
          type: typeof embeddingBlob,
        })
        continue
      }

      results.push({
        id: String(id),
        kbId: String(kbIdVal),
        pageNumber: Number(pageNumber),
        text: text,
        embedding: toEmbedding(embeddingBlob),
      })
    } catch (err) {
      console.error('[KB] Error processing row:', err)
    }
  }
  stmt.free()
  return results
}

export async function getAllEnabledChunks(): Promise<KBChunk[]> {
  if (!db) return []
  const enabledKBs = await getEnabledKBs()
  console.log(`[KB] Found ${enabledKBs.length} enabled KBs`)
  const chunkArrays = await Promise.all(
    enabledKBs.map((kb) => getChunksByKB(kb.id)),
  )
  const total = chunkArrays.reduce((sum, arr) => sum + arr.length, 0)
  console.log(
    `[KB] Loaded ${total} total chunks from ${chunkArrays.length} KBs`,
  )
  return chunkArrays.flat()
}
