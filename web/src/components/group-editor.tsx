"use client"

import { useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { ArrowRight, Plus, Users, X } from "lucide-react"
import { createGroup, getGroupDetails, updateGroup, type Group } from "@/lib/spliit-api"
import { avatarColor } from "@/lib/format"
import { rememberGroup } from "@/lib/storage"

type DraftParticipant = { id?: string; name: string }

export function GroupEditor({ baseURL, groupId, onClose, onSaved }: { baseURL: string; groupId?: string; onClose: () => void; onSaved: (group: Group) => void }) {
  const key = groupId ? [baseURL, "group-details", groupId] as const : null
  const { data, error, isLoading } = useSWR(key, ([server, , id]) => getGroupDetails(server, id))
  if (groupId && isLoading) return <EditorOverlay onClose={onClose}><div className="editor-loading"><span className="spinner" /> Loading group details…</div></EditorOverlay>
  if (groupId && (error || !data)) return <EditorOverlay onClose={onClose}><div className="editor-loading"><p role="alert">{error?.message ?? "Couldn’t load this group."}</p><button className="button button-ghost" onClick={onClose}>Close</button></div></EditorOverlay>
  return <GroupForm key={groupId ?? "new"} baseURL={baseURL} initialGroup={data?.group} blockedParticipants={data?.participantsWithExpenses ?? []} onClose={onClose} onSaved={onSaved} />
}

function GroupForm({ baseURL, initialGroup, blockedParticipants, onClose, onSaved }: { baseURL: string; initialGroup?: Group; blockedParticipants: string[]; onClose: () => void; onSaved: (group: Group) => void }) {
  const { mutate } = useSWRConfig()
  const [name, setName] = useState(initialGroup?.name ?? "")
  const [currencyCode, setCurrencyCode] = useState(initialGroup?.currencyCode ?? "USD")
  const [currency, setCurrency] = useState(initialGroup?.currency ?? "$" )
  const [information, setInformation] = useState(initialGroup?.information ?? "")
  const [participants, setParticipants] = useState<DraftParticipant[]>(initialGroup?.participants.map(({ id, name: participantName }) => ({ id, name: participantName })) ?? [{ name: "" }, { name: "" }])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [validation, setValidation] = useState("")
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", CHF: "CHF", PLN: "zł", JPY: "¥", AUD: "A$" }
  const isEditing = Boolean(initialGroup)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const names = participants.map((participant) => participant.name.trim())
    if (normalizedName.length < 2 || normalizedName.length > 50) return setValidation("Enter a group name between 2 and 50 characters.")
    if (!currency.trim() || currency.trim().length > 5) return setValidation("Enter a currency symbol with up to five characters.")
    if (!names.length || names.some((participant) => participant.length < 2 || participant.length > 50)) return setValidation("Every participant needs a name between 2 and 50 characters.")
    if (new Set(names.map((participant) => participant.toLocaleLowerCase())).size !== names.length) return setValidation("Participant names must be unique.")
    setValidation("")
    setBusy(true)
    setError("")
    const groupFormValues = { name: normalizedName, information: information.trim() || null, currency: currency.trim(), currencyCode: currencyCode.trim(), participants: participants.map((participant) => ({ ...(participant.id ? { id: participant.id } : {}), name: participant.name.trim() })) }
    try {
      if (initialGroup) {
        await updateGroup(baseURL, initialGroup.id, groupFormValues)
        const updated = { ...initialGroup, ...groupFormValues, participants: participants.map((participant, index) => ({ id: participant.id ?? `new-${index}`, name: participant.name.trim() })) }
        await rememberGroup({ groupId: updated.id, groupName: updated.name, instanceURL: baseURL })
        await mutate([baseURL, "group-details", initialGroup.id])
        onSaved(updated)
      } else {
        const result = await createGroup(baseURL, groupFormValues)
        const created: Group = { id: result.groupId, ...groupFormValues, participants: participants.map((participant, index) => ({ id: `new-${index}`, name: participant.name.trim() })) }
        await rememberGroup({ groupId: created.id, groupName: created.name, instanceURL: baseURL })
        onSaved(created)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save this group.")
    } finally {
      setBusy(false)
    }
  }

  return <EditorOverlay onClose={onClose}><header className="modal-head"><div><div className="eyebrow muted">{isEditing ? "GROUP DETAILS" : "NEW SHARED SPACE"}</div><h2>{isEditing ? "Group settings" : "Create a group"}</h2><p>{isEditing ? "Update the details and people in your group." : "Start with a name, currency and the people sharing."}</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
    <form className="modal-form" onSubmit={save}>
      <label className="field-label" htmlFor="editor-group-name">Group name</label><input className="text-input" id="editor-group-name" autoFocus maxLength={50} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekend in Lisbon" />
      <div className="field-row"><div className="field-grow"><label className="field-label" htmlFor="editor-currency">Currency</label><select className="text-input" id="editor-currency" value={currencyCode} onChange={(event) => { setCurrencyCode(event.target.value); setCurrency(symbols[event.target.value] ?? event.target.value) }}><option value="USD">US dollar · USD</option><option value="EUR">Euro · EUR</option><option value="GBP">Pound sterling · GBP</option><option value="PLN">Polish złoty · PLN</option><option value="CHF">Swiss franc · CHF</option><option value="CAD">Canadian dollar · CAD</option><option value="JPY">Japanese yen · JPY</option><option value="AUD">Australian dollar · AUD</option></select></div><div className="field-symbol"><label className="field-label" htmlFor="editor-symbol">Symbol</label><input className="text-input" id="editor-symbol" maxLength={5} required value={currency} onChange={(event) => setCurrency(event.target.value)} /></div></div>
      <label className="field-label" htmlFor="editor-information">Group note <span className="optional">OPTIONAL</span></label><textarea className="text-input textarea" id="editor-information" rows={2} value={information} onChange={(event) => setInformation(event.target.value)} placeholder="A little context for everyone" />
      <div className="field-label participants-label"><span><Users size={14} /> Participants</span><span className="optional">{participants.length} / 50</span></div>
      <div className="participant-fields">{participants.map((participant, index) => { const blocked = participant.id && blockedParticipants.includes(participant.id); return <div className="participant-field" key={participant.id ?? `new-${index}`}><span className="mini-avatar participant-mini" style={{ backgroundColor: avatarColor(participant.id ?? `participant-${index}`) }}>{participant.name.slice(0, 1).toUpperCase() || index + 1}</span><input className="text-input" aria-label={`Participant ${index + 1}`} maxLength={50} value={participant.name} onChange={(event) => setParticipants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Participant name" />{blocked ? <span className="locked-badge" title="This participant appears on an expense">In use</span> : <button type="button" className="remove-participant" aria-label={`Remove participant ${index + 1}`} disabled={participants.length <= 1} onClick={() => setParticipants((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>}</div>})}</div>
      <button type="button" className="text-action add-person" disabled={participants.length >= 50} onClick={() => setParticipants((current) => [...current, { name: "" }])}><Plus size={15} /> Add participant</button>
      {(validation || error) && <p className="form-error" role="alert">{validation || error}</p>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : isEditing ? "Save changes" : "Create group"}<ArrowRight size={15} /></button></div>
    </form></EditorOverlay>
}

function EditorOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true">{children}</section></div>
}
