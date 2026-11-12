"use client"

import { useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { ArrowRight, Plus, Users, X } from "lucide-react"
import { getGroupDetails, updateGroup, type Group } from "@/lib/spliit-api"
import { avatarColor } from "@/lib/format"
import { rememberGroup } from "@/lib/storage"

type DraftParticipant = { id?: string; name: string }

export function GroupEditor({ baseURL, groupId, onClose, onSaved }: { baseURL: string; groupId: string; onClose: () => void; onSaved: (group: Group) => void }) {
  const { data, error, isLoading } = useSWR([baseURL, "group-details", groupId], ([server, , id]) => getGroupDetails(server, id))

  if (isLoading) return <EditorOverlay onClose={onClose}><div className="editor-loading"><span className="spinner" /> Wczytuję szczegóły grupy…</div></EditorOverlay>
  if (error || !data) return <EditorOverlay onClose={onClose}><div className="editor-loading"><p role="alert">{error?.message ?? "Nie udało się wczytać grupy."}</p><button className="button button-ghost" onClick={onClose}>Zamknij</button></div></EditorOverlay>

  return <GroupForm key={groupId} baseURL={baseURL} initialGroup={data.group} blockedParticipants={data.participantsWithExpenses ?? []} onClose={onClose} onSaved={onSaved} />
}

function GroupForm({ baseURL, initialGroup, blockedParticipants, onClose, onSaved }: { baseURL: string; initialGroup: Group; blockedParticipants: string[]; onClose: () => void; onSaved: (group: Group) => void }) {
  const { mutate } = useSWRConfig()
  const [name, setName] = useState(initialGroup.name)
  const [currencyCode, setCurrencyCode] = useState(initialGroup.currencyCode ?? "PLN")
  const [currency, setCurrency] = useState(initialGroup.currency)
  const [information, setInformation] = useState(initialGroup.information ?? "")
  const [participants, setParticipants] = useState<DraftParticipant[]>(initialGroup.participants.map(({ id, name: participantName }) => ({ id, name: participantName })))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [validation, setValidation] = useState("")
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", CHF: "CHF", PLN: "zł", JPY: "¥", AUD: "A$" }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const names = participants.map((participant) => participant.name.trim())
    if (normalizedName.length < 2 || normalizedName.length > 50) return setValidation("Nazwa grupy musi mieć od 2 do 50 znaków.")
    if (!currency.trim() || currency.trim().length > 5) return setValidation("Wpisz symbol waluty (maksymalnie 5 znaków).")
    if (!names.length || names.some((participant) => participant.length < 2 || participant.length > 50)) return setValidation("Każda osoba musi mieć imię o długości od 2 do 50 znaków.")
    if (new Set(names.map((participant) => participant.toLocaleLowerCase("pl-PL"))).size !== names.length) return setValidation("Imiona uczestników muszą być unikalne.")

    setValidation("")
    setBusy(true)
    setError("")
    const values = {
      name: normalizedName,
      information: information.trim() || null,
      currency: currency.trim(),
      currencyCode: currencyCode.trim(),
      participants: participants.map((participant) => ({ ...(participant.id ? { id: participant.id } : {}), name: participant.name.trim() })),
    }

    try {
      await updateGroup(baseURL, initialGroup.id, values)
      const updated: Group = {
        ...initialGroup,
        ...values,
        participants: participants.map((participant, index) => ({ id: participant.id ?? `new-${index}`, name: participant.name.trim() })),
      }
      await rememberGroup({ groupId: updated.id, groupName: updated.name, instanceURL: baseURL })
      await mutate([baseURL, "group-details", initialGroup.id])
      onSaved(updated)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nie udało się zapisać zmian.")
    } finally {
      setBusy(false)
    }
  }

  return <EditorOverlay onClose={onClose}>
    <header className="modal-head">
      <div><div className="eyebrow muted">USTAWIENIA GRUPY</div><h2 id="group-editor-title">Edytuj grupę</h2><p>Zmień jej nazwę, walutę, opis lub listę uczestników.</p></div>
      <button className="icon-button" aria-label="Zamknij" onClick={onClose}><X size={18} /></button>
    </header>
    <form className="modal-form" aria-labelledby="group-editor-title" onSubmit={(event) => void save(event)}>
      <label className="field-label" htmlFor="editor-group-name">Nazwa grupy</label>
      <input className="text-input" id="editor-group-name" autoFocus maxLength={50} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekend w Lizbonie" />

      <div className="field-row">
        <div className="field-grow"><label className="field-label" htmlFor="editor-currency">Waluta</label><select className="text-input" id="editor-currency" value={currencyCode} onChange={(event) => { setCurrencyCode(event.target.value); setCurrency(symbols[event.target.value] ?? event.target.value) }}><option value="PLN">Polski złoty · PLN</option><option value="EUR">Euro · EUR</option><option value="USD">Dolar amerykański · USD</option><option value="GBP">Funt szterling · GBP</option><option value="CHF">Frank szwajcarski · CHF</option><option value="CAD">Dolar kanadyjski · CAD</option><option value="JPY">Jen japoński · JPY</option><option value="AUD">Dolar australijski · AUD</option></select></div>
        <div className="field-symbol"><label className="field-label" htmlFor="editor-symbol">Symbol</label><input className="text-input" id="editor-symbol" maxLength={5} required value={currency} onChange={(event) => setCurrency(event.target.value)} /></div>
      </div>

      <label className="field-label" htmlFor="editor-information">Opis grupy <span className="optional">OPCJONALNIE</span></label>
      <textarea className="text-input textarea" id="editor-information" rows={2} value={information} onChange={(event) => setInformation(event.target.value)} placeholder="Dodatkowe informacje dla wszystkich" />

      <div className="field-label participants-label"><span><Users size={14} /> Uczestnicy</span><span className="optional">{participants.length} / 50</span></div>
      <div className="participant-fields">{participants.map((participant, index) => {
        const blocked = participant.id && blockedParticipants.includes(participant.id)
        return <div className="participant-field" key={participant.id ?? `participant-${index}`}>
          <span className="mini-avatar participant-mini" style={{ backgroundColor: avatarColor(participant.id ?? `participant-${index}`) }}>{participant.name.slice(0, 1).toUpperCase() || index + 1}</span>
          <input className="text-input" aria-label={`Uczestnik ${index + 1}`} maxLength={50} value={participant.name} onChange={(event) => setParticipants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Imię i nazwisko" />
          {blocked ? <span className="locked-badge" title="Ta osoba jest przypisana do wydatku">W użyciu</span> : <button type="button" className="remove-participant" aria-label={`Usuń uczestnika ${index + 1}`} disabled={participants.length <= 1} onClick={() => setParticipants((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>}
        </div>
      })}</div>
      <button type="button" className="text-action add-person" disabled={participants.length >= 50} onClick={() => setParticipants((current) => [...current, { name: "" }])}><Plus size={15} /> Dodaj osobę</button>
      {(validation || error) && <p className="form-error" role="alert">{validation || error}</p>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Anuluj</button><button className="button button-primary" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz zmiany"}<ArrowRight size={15} /></button></div>
    </form>
  </EditorOverlay>
}

function EditorOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true" aria-label="Edytuj grupę">{children}</section></div>
}
