import { useEffect, useRef, useState } from 'react'
import { MdDelete, MdFolder, MdSelectAll, MdClear } from 'react-icons/md'

import { useTranslation, useAIConfig } from '@flow/reader/hooks'

import { KnowledgeBase } from '../../knowledgeBase/types'
import {
  getAllKBs,
  deleteKB,
  toggleKB,
  renameKB,
  ingestPDF,
  initStorage,
  switchToSQLite,
  reconnectFolder,
  usingSQLite,
  getDisplayPath,
} from '../../utils/rag'
import { PaneViewProps, PaneView, Pane } from '../base'

export const KBView: React.FC<PaneViewProps> = (props) => {
  const [config, setConfig] = useAIConfig()
  const t = useTranslation()
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [processing, setProcessing] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [storagePath, setStoragePath] = useState('')
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Batch select
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initStorage()
      .then((ok) => {
        if (ok) {
          setStoragePath(getDisplayPath())
        } else {
          // If display path is set but init failed, permission was lost
          const path = getDisplayPath()
          if (path) setNeedsReconnect(true)
        }
        return getAllKBs()
      })
      .then(setKbs)
  }, [])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const handleSelectFolder = async () => {
    try {
      const path = await switchToSQLite()
      setStoragePath(path)
      setNeedsReconnect(false)
      const updatedKBs = await getAllKBs()
      setKbs(updatedKBs)
    } catch {
      // User cancelled or error
    }
  }

  const handleReconnect = async () => {
    const path = await reconnectFolder()
    if (path) {
      setStoragePath(path)
      setNeedsReconnect(false)
      const updatedKBs = await getAllKBs()
      setKbs(updatedKBs)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    if (!usingSQLite()) {
      setProgressMsg(t('kb.needs_folder'))
      setTimeout(() => setProgressMsg(''), 3000)
      return
    }

    const cleanName = file.name.replace(/\.pdf$/i, '')

    // Duplicate check
    const existing = kbs.find((kb) => kb.name === cleanName)
    if (existing) {
      if (!confirm(t('kb.duplicate').replace('{name}', cleanName))) {
        return
      }
      await deleteKB(existing.id)
      setKbs((prev) => prev.filter((k) => k.id !== existing.id))
    }

    setProcessing(true)
    setProgressMsg(t('kb.parsing'))

    try {
      await ingestPDF(file, cleanName, config, (progress) => {
        if (progress.phase === 'parsing') {
          setProgressMsg(t('kb.parsing'))
        } else {
          setProgressCurrent(progress.current)
          setProgressTotal(progress.total)
          let msg = t('kb.embedding')
            .replace('{{current}}', progress.current.toString())
            .replace('{{total}}', progress.total.toString())
          if (progress.errors) {
            msg += ` - ${progress.errors} failed`
          }
          setProgressMsg(msg)
        }
      })

      const updatedKBs = await getAllKBs()
      setKbs(updatedKBs)
    } catch (err) {
      setProgressMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setTimeout(() => {
        setProcessing(false)
        setProgressMsg('')
        setProgressCurrent(0)
        setProgressTotal(0)
      }, 3000)
    }
  }

  const handleToggle = async (kb: KnowledgeBase) => {
    const enabled = !kb.enabled
    setKbs((prev) => prev.map((k) => (k.id === kb.id ? { ...k, enabled } : k)))
    toggleKB(kb.id, enabled).catch(console.error)
  }

  const handleDelete = (kb: KnowledgeBase) => {
    setKbs((prev) => prev.filter((k) => k.id !== kb.id))
    deleteKB(kb.id).catch(console.error)
  }

  // Rename
  const startRename = (kb: KnowledgeBase) => {
    setEditingId(kb.id)
    setEditingName(kb.name)
  }

  const commitRename = async (kbId: string) => {
    const newName = editingName.trim()
    if (newName && newName !== kbs.find((k) => k.id === kbId)?.name) {
      setKbs((prev) =>
        prev.map((k) => (k.id === kbId ? { ...k, name: newName } : k)),
      )
      renameKB(kbId, newName).catch(console.error)
    }
    setEditingId(null)
  }

  // Batch operations
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (next.size === 0) setSelectMode(false)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(kbs.map((k) => k.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
    setSelectMode(false)
  }

  const batchDelete = () => {
    for (const id of selectedIds) {
      deleteKB(id).catch(console.error)
    }
    setKbs((prev) => prev.filter((k) => !selectedIds.has(k.id)))
    deselectAll()
  }

  const batchToggle = (enabled: boolean) => {
    for (const id of selectedIds) {
      toggleKB(id, enabled).catch(console.error)
    }
    setKbs((prev) =>
      prev.map((k) => (selectedIds.has(k.id) ? { ...k, enabled } : k)),
    )
    deselectAll()
  }

  return (
    <PaneView {...props}>
      <Pane headline={t('kb.title')} className="space-y-3 px-5 pt-2 pb-4">
        {/* Folder selector */}
        {storagePath ? (
          <div className="typescale-body-small text-on-surface-variant flex items-center gap-1.5 rounded bg-black/5 px-2 py-1.5">
            <MdFolder size={14} className="shrink-0" />
            <span className="truncate" title={storagePath}>
              {t('kb.folder_path')}: {storagePath}
            </span>
          </div>
        ) : needsReconnect ? (
          <button
            onClick={handleReconnect}
            className="border-primary text-primary typescale-label-medium hover:bg-primary/10 flex w-full items-center justify-center gap-2 rounded border px-3 py-2"
          >
            <MdFolder size={20} />
            {t('kb.folder_path')}: {getDisplayPath()} — 点击重新授权
          </button>
        ) : (
          <button
            onClick={handleSelectFolder}
            className="border-outline-variant text-on-surface-variant typescale-label-medium flex w-full items-center justify-center gap-2 rounded border px-3 py-2 hover:bg-black/5"
          >
            <MdFolder size={20} />
            {t('kb.select_folder')}
          </button>
        )}

        {/* Context length setting */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="typescale-body-small text-on-surface-variant">
              {t('kb.context_length')}
            </label>
            <span className="typescale-body-small text-on-surface font-mono">
              {config.ragContextLength ?? 1000}
            </span>
          </div>
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={config.ragContextLength ?? 1000}
            onChange={(e) =>
              setConfig({ ...config, ragContextLength: Number(e.target.value) })
            }
            className="accent-primary w-full"
          />
          <div className="typescale-body-small text-on-surface-variant flex justify-between">
            <span>200</span>
            <span>5000</span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleUpload}
          className="hidden"
        />

        {/* Action bar: upload + batch toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={processing || !usingSQLite()}
            className="bg-primary text-on-primary typescale-label-medium flex-1 rounded px-3 py-2 hover:opacity-90 disabled:opacity-50"
          >
            {processing ? t('kb.processing') : t('kb.upload')}
          </button>
          {kbs.length > 0 && (
            <button
              onClick={() => {
                setSelectMode(!selectMode)
                if (selectMode) deselectAll()
              }}
              className="border-outline-variant text-on-surface-variant typescale-label-medium rounded border px-3 py-2 hover:bg-black/5"
            >
              {selectMode ? String.fromCodePoint(0x2715) : t('kb.batch_select')}
            </button>
          )}
        </div>

        {/* Batch toolbar */}
        {selectMode && (
          <div className="bg-surface-variant flex flex-wrap items-center gap-1.5 rounded px-2 py-1.5">
            <span className="typescale-body-small text-on-surface-variant mr-1">
              {t('kb.batch_count').replace('{n}', selectedIds.size.toString())}
            </span>
            <button
              onClick={selectAll}
              className="typescale-body-small text-on-surface-variant hover:text-on-surface rounded px-1.5 py-0.5"
              title={t('kb.batch_select_all')}
            >
              <MdSelectAll size={16} />
            </button>
            <button
              onClick={deselectAll}
              className="typescale-body-small text-on-surface-variant hover:text-on-surface rounded px-1.5 py-0.5"
              title={t('kb.batch_deselect_all')}
            >
              <MdClear size={16} />
            </button>
            <span className="text-outline-variant mx-1">|</span>
            <button
              onClick={() => batchToggle(true)}
              disabled={selectedIds.size === 0}
              className="typescale-body-small text-on-surface-variant disabled:text-outline/30 hover:text-on-surface rounded px-1.5 py-0.5"
            >
              {t('kb.batch_enable')}
            </button>
            <button
              onClick={() => batchToggle(false)}
              disabled={selectedIds.size === 0}
              className="typescale-body-small text-on-surface-variant disabled:text-outline/30 hover:text-on-surface rounded px-1.5 py-0.5"
            >
              {t('kb.batch_disable')}
            </button>
            <button
              onClick={batchDelete}
              disabled={selectedIds.size === 0}
              className="typescale-body-small text-error disabled:text-outline/30 rounded px-1.5 py-0.5 hover:underline"
            >
              {t('kb.batch_delete')}
            </button>
          </div>
        )}

        {/* Progress */}
        {progressMsg && (
          <div>
            <div className="typescale-body-small text-on-surface-variant mb-1">
              {progressMsg}
            </div>
            {progressTotal > 0 && (
              <div className="bg-surface-variant h-1.5 w-full overflow-hidden rounded">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (progressCurrent / progressTotal) * 100,
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {kbs.length === 0 && !processing && (
          <div className="typescale-body-small text-on-surface-variant py-2 text-center">
            {t('kb.empty')}
          </div>
        )}

        {/* KB list */}
        {kbs.map((kb) => (
          <div
            key={kb.id}
            className="bg-surface-variant flex items-center gap-2 rounded px-3 py-2"
          >
            {/* Batch select checkbox */}
            {selectMode && (
              <input
                type="checkbox"
                checked={selectedIds.has(kb.id)}
                onChange={() => toggleSelect(kb.id)}
                className="accent-primary shrink-0"
              />
            )}

            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden">
              {!selectMode && (
                <input
                  type="checkbox"
                  checked={kb.enabled}
                  onChange={() => handleToggle(kb)}
                  className="accent-primary shrink-0"
                />
              )}
              {editingId === kb.id ? (
                <input
                  ref={editInputRef}
                  className="typescale-body-medium text-on-surface border-primary min-w-0 flex-1 border-b bg-transparent outline-none"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => commitRename(kb.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(kb.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span
                  className="typescale-body-medium text-on-surface truncate"
                  onDoubleClick={() => startRename(kb)}
                  title={t('kb.rename')}
                >
                  {kb.name}
                </span>
              )}
              <span className="typescale-body-small text-on-surface-variant shrink-0">
                ({kb.chunkCount})
              </span>
            </label>
            <button
              onClick={() => handleDelete(kb)}
              className="text-error hover:text-error/80 shrink-0"
              title={t('kb.delete')}
            >
              <MdDelete size={18} />
            </button>
          </div>
        ))}
      </Pane>
    </PaneView>
  )
}
