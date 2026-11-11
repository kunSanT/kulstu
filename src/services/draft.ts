import { isRecipe, normalizeRecipe, type Recipe } from '../engine/recipe'

type DraftContent = { blob: Blob; name: string; sample: boolean; recipe: Recipe; savedAt: number }
export type Draft = DraftContent & { id: string }
export type DraftSummary = Pick<Draft, 'id' | 'name' | 'sample' | 'savedAt'>

// Giữ tên cũ để không mất bản nháp đã lưu trên trình duyệt người dùng.
const DB = 'kultu'
const META = 'draft'
const PROJECTS = 'projects'
const LIST = 'project-list'
const LATEST = 'latest'

const summary = ({ id, name, sample, savedAt }: Draft): DraftSummary => ({ id, name, sample, savedAt })

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      const meta = db.objectStoreNames.contains(META) ? req.transaction!.objectStore(META) : db.createObjectStore(META)
      const projects = db.createObjectStore(PROJECTS, { keyPath: 'id' })
      const list = db.createObjectStore(LIST, { keyPath: 'id' })
      const previous = meta.get(LATEST)
      previous.onsuccess = () => {
        const old = previous.result as DraftContent | undefined
        if (!old || !(old.blob instanceof Blob) || !isRecipe(old.recipe)) return
        const draft: Draft = { ...old, id: 'legacy' }
        projects.put(draft)
        list.put(summary(draft))
        meta.put(draft.id, LATEST)
      }
    }
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close()
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('blocked'))
  })
}

async function run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode)
      const req = work(tx)
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('abort'))
    })
  } finally {
    db.close()
  }
}

export const saveDraft = (draft: Draft) => run([META, PROJECTS, LIST], 'readwrite', (tx) => {
  tx.objectStore(PROJECTS).put(draft)
  tx.objectStore(LIST).put(summary(draft))
  return tx.objectStore(META).put(draft.id, LATEST)
})

export const selectDraft = (id: string) => run([META], 'readwrite', (tx) => tx.objectStore(META).put(id, LATEST))

export const deleteDraft = (id: string) => run([META, PROJECTS, LIST], 'readwrite', (tx) => {
  const meta = tx.objectStore(META)
  const last = meta.get(LATEST)
  last.onsuccess = () => { if (last.result === id) meta.delete(LATEST) }
  tx.objectStore(LIST).delete(id)
  return tx.objectStore(PROJECTS).delete(id)
})

export async function listDrafts(): Promise<DraftSummary[]> {
  const list = await run([LIST], 'readonly', (tx) => tx.objectStore(LIST).getAll())
  return (list as DraftSummary[]).sort((a, b) => b.savedAt - a.savedAt)
}

export async function loadDraft(id?: string): Promise<Draft | null> {
  try {
    const key = id ?? await run([META], 'readonly', (tx) => tx.objectStore(META).get(LATEST))
      ?? (await listDrafts())[0]?.id
    if (!key) return null
    const draft = await run([PROJECTS], 'readonly', (tx) => tx.objectStore(PROJECTS).get(key)) as Draft | undefined
    return draft && draft.blob instanceof Blob && isRecipe(draft.recipe)
      ? { ...draft, recipe: normalizeRecipe(draft.recipe) }
      : null
  } catch {
    return null
  }
}
