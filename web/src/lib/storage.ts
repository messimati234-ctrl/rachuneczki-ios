import { OFFICIAL_INSTANCE } from "@/lib/spliit-api"

const DATABASE = "spliit-pwa"
const VERSION = 1
const GROUPS = "groups"
const SETTINGS = "settings"

type Setting = { key: string; value: string }
export type RecentGroup = {
  groupId: string
  groupName: string
  instanceURL: string
  visitedAt: number
  starred: boolean
  archived: boolean
  participantId?: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Ta przeglądarka nie obsługuje lokalnego zapisu grupy."))
      return
    }
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(GROUPS)) db.createObjectStore(GROUPS, { keyPath: "groupId" })
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "key" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Nie udało się otworzyć lokalnej pamięci."))
  })
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Nie udało się zapisać tej zmiany."))
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error ?? new Error("Nie udało się zapisać tej zmiany."))
  })
}

export async function getRecentGroups(): Promise<RecentGroup[]> {
  const groups = await withStore<RecentGroup[]>(GROUPS, "readonly", (store) => store.getAll())
  const [currentGroup] = groups.sort((left, right) => right.visitedAt - left.visitedAt)
  return currentGroup ? [currentGroup] : []
}

export async function getRecentGroup(groupId: string): Promise<RecentGroup | undefined> {
  return withStore<RecentGroup | undefined>(GROUPS, "readonly", (store) => store.get(groupId))
}

export async function rememberGroup(group: Pick<RecentGroup, "groupId" | "groupName" | "instanceURL">) {
  const previous = await getRecentGroup(group.groupId)
  const next: RecentGroup = { ...previous, ...group, visitedAt: Date.now(), starred: previous?.starred ?? false, archived: previous?.archived ?? false }
  await withStore(GROUPS, "readwrite", (store) => {
    store.clear()
    return store.put(next)
  })
  return next
}

export async function updateRecentGroup(groupId: string, patch: Partial<RecentGroup>) {
  const current = await getRecentGroup(groupId)
  if (!current) return
  await withStore(GROUPS, "readwrite", (store) => store.put({ ...current, ...patch }))
}

export async function forgetGroup(groupId: string) {
  await withStore(GROUPS, "readwrite", (store) => store.delete(groupId))
}

export async function getDefaultInstance() {
  const setting = await withStore<Setting | undefined>(SETTINGS, "readonly", (store) => store.get("defaultInstance"))
  return setting?.value ?? OFFICIAL_INSTANCE
}

export async function setDefaultInstance(value: string) {
  const parsed = new URL(value)
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Podaj prawidłowy adres serwera z protokołem HTTP lub HTTPS.")
  }
  parsed.hash = ""
  parsed.search = ""
  const normalized = parsed.href.endsWith("/") ? parsed.href : `${parsed.href}/`
  await withStore(SETTINGS, "readwrite", (store) => store.put({ key: "defaultInstance", value: normalized }))
  return normalized
}
