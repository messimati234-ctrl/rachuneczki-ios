"use client"

import { useState } from "react"
import { Camera, LoaderCircle } from "lucide-react"
import { readReceipt, type ReceiptFields } from "@/lib/receipt-ocr"

export function ReceiptScanField({ onRead, onScanningChange }: { onRead: (receipt: ReceiptFields) => void; onScanningChange: (scanning: boolean) => void }) {
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [scanning, setScanning] = useState(false)

  async function scan(file: File | undefined) {
    if (!file) return
    setError("")
    setStatus("")
    if (!file.type.startsWith("image/")) {
      setError("Wybierz zdjęcie paragonu w formacie JPG, PNG lub WebP.")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Zdjęcie jest za duże. Wybierz plik mniejszy niż 15 MB.")
      return
    }

    setScanning(true)
    onScanningChange(true)
    setStatus("Przygotowuję skaner…")
    try {
      const receipt = await readReceipt(file, (stage, progress) => {
        if (stage === "recognizing text") setStatus(`Odczyt paragonu: ${Math.round(progress * 100)}%`)
        else setStatus("Przygotowuję skaner…")
      })
      onRead(receipt)
      if (receipt.amount !== undefined && receipt.title) setStatus("Odczytano kwotę i nazwę. Sprawdź je przed zapisaniem.")
      else if (receipt.amount !== undefined) setStatus("Odczytano kwotę. Sprawdź ją przed zapisaniem.")
      else if (receipt.title) setStatus("Odczytano nazwę. Uzupełnij kwotę ręcznie.")
      else setError("Nie udało się odczytać danych. Wpisz je ręcznie lub spróbuj wyraźniejszego zdjęcia.")
    } catch {
      setError("Nie udało się zeskanować paragonu. Sprawdź połączenie i spróbuj ponownie albo wpisz dane ręcznie.")
      setStatus("")
    } finally {
      setScanning(false)
      onScanningChange(false)
    }
  }

  return <div className="receipt-scan-box">
    <input className="receipt-scan-input" id="expense-receipt" type="file" accept="image/*" capture="environment" aria-describedby="receipt-scan-help" disabled={scanning} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void scan(file) }} />
    <label className={`receipt-scan-trigger ${scanning ? "is-scanning" : ""}`} htmlFor="expense-receipt">
      {scanning ? <LoaderCircle className="receipt-scan-spinner" size={17} aria-hidden="true" /> : <Camera size={17} aria-hidden="true" />}
      <span>{scanning ? "Skanuję paragon…" : "Zeskanuj paragon aparatem lub zdjęciem"}</span>
    </label>
    <p className="receipt-scan-hint" id="receipt-scan-help">Zdjęcie przetwarzamy na tym urządzeniu; zapisujemy tylko odczytaną nazwę i kwotę.</p>
    {status && <p className="receipt-scan-status" role="status" aria-live="polite">{status}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}
