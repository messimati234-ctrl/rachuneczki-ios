import type { Group } from "@/lib/spliit-api"

export function minorUnitDigits(currencyCode?: string | null) {
  if (!currencyCode) return 2
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

export function formatMoney(minorUnits: number, group: Pick<Group, "currency" | "currencyCode">) {
  const digits = minorUnitDigits(group.currencyCode)
  const amount = minorUnits / 10 ** digits
  if (group.currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: group.currencyCode, maximumFractionDigits: digits }).format(amount)
    } catch {
      // An older self-hosted instance can contain a currency code unknown to this browser.
    }
  }
  return `${group.currency}${new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)}`
}

export function amountToMinor(value: string, digits: number) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".")
  if (!normalized || !/^\d+(\.\d*)?$/.test(normalized)) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return null
  return Math.round(amount * 10 ** digits)
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toLocaleUpperCase()).join("") || "?"
}

export function avatarColor(seed: string) {
  const palette = ["#059669", "#0e7490", "#4f46e5", "#be185d", "#c2410c", "#a16207", "#4d7c0f", "#7c3aed"]
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619)
  return palette[(hash >>> 0) % palette.length]
}
