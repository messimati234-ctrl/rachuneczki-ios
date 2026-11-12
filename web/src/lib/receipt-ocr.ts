export type ReceiptFields = { title?: string; amount?: number }
export type OcrProgress = (status: string, progress: number) => void

const amountPattern = /(\d{1,3}(?:[ \u00a0.]\d{3})*|\d+)[,.](\d{2})(?!\d)/g
const totalPattern = /razem|suma|do zap(?:ł|l)aty|należno|total|amount due/i
const ignoredMerchantLine = /^(paragon|faktura|rachunek|data|godzina|nip|regon|kasjer|numer|nr\b|terminal|suma|razem|do zap|kwota|towar|ilość|cena|płatność|gotówka|karta)\b/i

function parseAmount(value: string) {
  const compact = value.replace(/[ \u00a0]/g, "")
  const decimalIndex = Math.max(compact.lastIndexOf(","), compact.lastIndexOf("."))
  if (decimalIndex < 0) return null
  const integer = compact.slice(0, decimalIndex).replace(/\D/g, "")
  const decimals = compact.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2)
  if (!integer || decimals.length !== 2) return null
  const amount = Number(`${integer}.${decimals}`)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function parseReceiptText(text: string): ReceiptFields {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean)
  const amounts: { value: number; total: boolean; line: number }[] = []

  lines.forEach((line, lineIndex) => {
    const context = lines.slice(Math.max(0, lineIndex - 1), lineIndex + 2).join(" ")
    for (const match of line.matchAll(amountPattern)) {
      const value = parseAmount(match[0])
      if (value !== null) amounts.push({ value, total: totalPattern.test(context), line: lineIndex })
    }
  })

  const bestAmount = amounts.sort((left, right) => Number(right.total) - Number(left.total) || right.line - left.line || right.value - left.value)[0]?.value
  const title = lines.find((line) => /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(line) && !ignoredMerchantLine.test(line) && !/^\d/.test(line))

  return {
    ...(title ? { title: title.slice(0, 120) } : {}),
    ...(bestAmount !== undefined ? { amount: bestAmount } : {}),
  }
}

export async function readReceipt(file: File, onProgress?: OcrProgress) {
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker(["pol", "eng"], undefined, {
    logger: (message) => onProgress?.(message.status, message.progress),
  })

  try {
    const { data } = await worker.recognize(file)
    return parseReceiptText(data.text)
  } finally {
    await worker.terminate()
  }
}
