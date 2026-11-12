"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { ArrowRight } from "lucide-react"
import { createGroup, getGroup, OFFICIAL_INSTANCE } from "@/lib/spliit-api"
import { rememberGroup } from "@/lib/storage"

const currencies = [
  { code: "PLN", symbol: "zł", label: "Polski złoty · PLN" },
  { code: "EUR", symbol: "€", label: "Euro · EUR" },
  { code: "USD", symbol: "$", label: "Dolar amerykański · USD" },
  { code: "GBP", symbol: "£", label: "Funt szterling · GBP" },
  { code: "CHF", symbol: "CHF", label: "Frank szwajcarski · CHF" },
  { code: "CAD", symbol: "CA$", label: "Dolar kanadyjski · CAD" },
  { code: "JPY", symbol: "¥", label: "Jen japoński · JPY" },
  { code: "AUD", symbol: "A$", label: "Dolar australijski · AUD" },
]

export function CreateHomeForm({ replacesCurrentHome, onCreated }: { replacesCurrentHome: boolean; onCreated: (groupId: string) => void | Promise<void> }) {
  const [name, setName] = useState("Mój Dom")
  const [ownerName, setOwnerName] = useState("")
  const [currencyCode, setCurrencyCode] = useState("PLN")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedOwnerName = ownerName.trim()
    if (normalizedName.length < 2 || normalizedName.length > 50) {
      setError("Nazwa Domu musi mieć od 2 do 50 znaków.")
      return
    }
    if (normalizedOwnerName.length < 2 || normalizedOwnerName.length > 50) {
      setError("Twoje imię musi mieć od 2 do 50 znaków.")
      return
    }

    setError("")
    setBusy(true)
    try {
      const currency = currencies.find((option) => option.code === currencyCode) ?? currencies[0]
      const { groupId } = await createGroup(OFFICIAL_INSTANCE, {
        name: normalizedName,
        currency: currency.symbol,
        currencyCode: currency.code,
        participants: [{ name: normalizedOwnerName }],
      })

      let groupName = normalizedName
      let participantId: string | undefined
      try {
        const { group } = await getGroup(OFFICIAL_INSTANCE, groupId)
        if (group) {
          groupName = group.name
          participantId = group.participants.find((participant) => participant.name.toLocaleLowerCase("pl-PL") === normalizedOwnerName.toLocaleLowerCase("pl-PL"))?.id
        }
      } catch {
        // The create mutation already succeeded; the destination view can retry loading this Dom.
      }

      await rememberGroup({ groupId, groupName, instanceURL: OFFICIAL_INSTANCE, ...(participantId ? { participantId } : {}) })
      await onCreated(groupId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nie udało się utworzyć Domu.")
    } finally {
      setBusy(false)
    }
  }

  return <form className="join-form create-home-form" onSubmit={(event) => void submit(event)}>
    <label className="field-label" htmlFor="new-home-name">Nazwa Domu</label>
    <input className="text-input" id="new-home-name" autoComplete="organization" minLength={2} maxLength={50} required value={name} onChange={(event) => setName(event.target.value)} />

    <label className="field-label" htmlFor="new-home-owner">Twoje imię</label>
    <input className="text-input" id="new-home-owner" autoComplete="name" minLength={2} maxLength={50} required value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="np. Ania" />

    <label className="field-label" htmlFor="new-home-currency">Waluta</label>
    <select className="text-input" id="new-home-currency" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
      {currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}
    </select>

    {replacesCurrentHome && <p className="create-home-warning" role="status">Po utworzeniu nowy Dom zastąpi obecny zapisany na tym urządzeniu.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary join-submit" disabled={busy || !name.trim() || !ownerName.trim()}>
      {busy ? "Tworzę Dom…" : "Utwórz Dom"}<ArrowRight size={16} />
    </button>
  </form>
}
