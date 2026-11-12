export const OFFICIAL_INSTANCE = "https://spliit.app/"

export type Participant = { id: string; name: string }
export type Group = {
  id: string
  name: string
  information?: string | null
  currency: string
  currencyCode?: string | null
  createdAt?: string
  participants: Participant[]
}
export type GroupSummary = {
  id: string
  name: string
  currency: string
  createdAt: string
  participantCount: number
}
export type GroupFormValues = {
  name: string
  information?: string
  currency: string
  currencyCode: string
  participants: { name: string }[]
}
export type Category = { id: number; grouping: string; name: string }
export type Expense = {
  id: string
  title: string
  amount: number
  createdAt: string
  expenseDate: string
  isReimbursement: boolean
  splitMode: SplitMode
  category?: Category | null
  paidBy: Participant
  paidFor: { participant: Participant; shares: number }[]
  documentCount: number
}
export type ExpenseDetails = {
  id: string
  groupId: string
  title: string
  amount: number
  categoryId: number
  category?: Category | null
  expenseDate: string
  paidById: string
  paidBy: Participant
  paidFor: { participantId: string; shares: number }[]
  isReimbursement: boolean
  splitMode: SplitMode
  notes?: string | null
  documents: { id: string; url: string; width: number; height: number }[]
  documentCount?: number
  recurrenceRule?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | null
}
export type SplitMode = "EVENLY" | "BY_SHARES" | "BY_PERCENTAGE" | "BY_AMOUNT"
export type Balance = { paid: number; paidFor: number; total: number }
export type Reimbursement = { from: string; to: string; amount: number }
export type BalancesResponse = { balances: Record<string, Balance>; reimbursements: Reimbursement[] }
export type ExpensePage = { expenses: Expense[]; hasMore: boolean; nextCursor: number }

function serialize(value: unknown, path: string[] = [], dates: Record<string, string[]> = {}): unknown {
  if (value instanceof Date) {
    dates[path.join(".")] = ["Date"]
    return value.toISOString()
  }
  if (Array.isArray(value)) return value.map((item, index) => serialize(item, [...path, String(index)], dates))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item, [...path, key], dates)]))
  }
  return value
}

function endpointFor(instanceURL: string, procedure: string) {
  const base = new URL(instanceURL)
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("Podaj prawidłowy adres serwera Spliit z protokołem HTTP lub HTTPS.")
  }
  base.search = ""
  base.hash = ""
  const directory = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`
  return new URL(`api/trpc/${procedure}`, `${base.origin}${directory}`)
}

export async function trpc<T>(
  instanceURL: string,
  procedure: string,
  kind: "query" | "mutation",
  input?: unknown,
): Promise<T> {
  const dates: Record<string, string[]> = {}
  const json = serialize(input ?? null, [], dates)
  const envelope: { json: unknown; meta?: { values: Record<string, string[]> } } = { json }
  if (Object.keys(dates).length) envelope.meta = { values: dates }
  const url = endpointFor(instanceURL, procedure)
  const init: RequestInit = { method: kind === "mutation" ? "POST" : "GET", cache: "no-store", headers: { Accept: "application/json" } }
  if (kind === "query" && input !== undefined) url.searchParams.set("input", JSON.stringify(envelope))
  if (kind === "mutation") {
    init.headers = { ...init.headers, "Content-Type": "application/json" }
    init.body = JSON.stringify(envelope)
  }

  let response: Response
  try {
    const configured = new URL(instanceURL)
    const officialInstance = configured.origin === OFFICIAL_INSTANCE.slice(0, -1) && configured.pathname === "/"
    if (officialInstance && typeof window !== "undefined") {
      const proxyURL = new URL(`/api/spliit/${procedure.split(".").map(encodeURIComponent).join("/")}`, window.location.origin)
      const query = url.searchParams.get("input")
      if (query) proxyURL.searchParams.set("input", query)
      response = await fetch(proxyURL, init)
    } else {
      response = await fetch(url, init)
    }
  } catch {
    throw new Error("Nie można połączyć z serwerem Spliit. Może wymagać dodania domeny aplikacji w ustawieniach CORS.")
  }
  type ResponsePayload = {
    error?: { json?: { message?: string; data?: { code?: string } } }
    result?: { data?: { json?: T } }
  }
  let payload: ResponsePayload
  try {
    payload = await response.json() as ResponsePayload
  } catch {
    throw new Error(`Serwer zwrócił nieczytelną odpowiedź (status ${response.status}).`)
  }
  if (!response.ok || payload.error) {
    const failure = new Error(payload.error?.json?.message || `Żądanie nie powiodło się (status ${response.status}).`) as Error & { code?: string }
    failure.code = payload.error?.json?.data?.code
    throw failure
  }
  return payload.result?.data?.json as T
}

export const getGroup = (base: string, groupId: string) =>
  trpc<{ group: Group | null }>(base, "groups.get", "query", { groupId })

export const createGroup = (base: string, groupFormValues: GroupFormValues) =>
  trpc<{ groupId: string }>(base, "groups.create", "mutation", { groupFormValues })

export const getGroupDetails = (base: string, groupId: string) =>
  trpc<{ group: Group; participantsWithExpenses: string[] }>(base, "groups.getDetails", "query", { groupId })

export const listGroups = (base: string, groupIds: string[]) =>
  trpc<{ groups: GroupSummary[] }>(base, "groups.list", "query", { groupIds })

export const updateGroup = (base: string, groupId: string, groupFormValues: unknown, participantId?: string) =>
  trpc<unknown>(base, "groups.update", "mutation", { groupId, groupFormValues, participantId })

export const listExpenses = (base: string, groupId: string, cursor = 0) =>
  trpc<ExpensePage>(base, "groups.expenses.list", "query", { groupId, cursor, limit: 20 })

export const getExpense = (base: string, groupId: string, expenseId: string) =>
  trpc<{ expense: ExpenseDetails }>(base, "groups.expenses.get", "query", { groupId, expenseId })

export const createExpense = (base: string, groupId: string, expenseFormValues: unknown, participantId?: string) =>
  trpc<{ expenseId: string }>(base, "groups.expenses.create", "mutation", { groupId, expenseFormValues, participantId })

export const updateExpense = (base: string, groupId: string, expenseId: string, expenseFormValues: unknown, participantId?: string) =>
  trpc<{ expenseId: string }>(base, "groups.expenses.update", "mutation", { groupId, expenseId, expenseFormValues, participantId })

export const deleteExpense = (base: string, groupId: string, expenseId: string, participantId?: string) =>
  trpc<unknown>(base, "groups.expenses.delete", "mutation", { groupId, expenseId, participantId })

export const getBalances = (base: string, groupId: string) =>
  trpc<BalancesResponse>(base, "groups.balances.list", "query", { groupId })

export async function getStats(base: string, groupId: string, participantId?: string) {
  const input = { groupId, ...(participantId ? { participantId } : {}) }
  try {
    return await trpc<{ totalGroupSpendings: number; totalParticipantSpendings?: number; totalParticipantShare?: number }>(base, "groups.stats.overview", "query", input)
  } catch (error) {
    if (!(error instanceof Error) || (error as Error & { code?: string }).code !== "NOT_FOUND") throw error
    return trpc<{ totalGroupSpendings: number; totalParticipantSpendings?: number; totalParticipantShare?: number }>(base, "groups.stats.get", "query", input)
  }
}

export const listCategories = (base: string) =>
  trpc<{ categories: Category[] }>(base, "categories.list", "query")
