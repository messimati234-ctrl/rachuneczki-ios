"use client"

import { useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { ArrowRight, ReceiptText, X } from "lucide-react"
import { createExpense, getExpense, updateExpense, type Category, type ExpenseDetails, type Group, type Reimbursement, type SplitMode } from "@/lib/spliit-api"
import { amountToMinor, minorUnitDigits } from "@/lib/format"

type ShareDraft = { participantId: string; name: string; included: boolean; value: string }
const splitLabels: Record<SplitMode, string> = { EVENLY: "Equally", BY_SHARES: "By shares", BY_PERCENTAGE: "By percentage", BY_AMOUNT: "By amount" }

export function ExpenseForm({ baseURL, group, categories, expenseId, settlement, participantId, onClose, onSaved }: { baseURL: string; group: Group; categories: Category[]; expenseId?: string; settlement?: Reimbursement; participantId?: string; onClose: () => void; onSaved: () => void }) {
  const key = expenseId ? [baseURL, "expense", group.id, expenseId] as const : null
  const { data, error, isLoading } = useSWR(key, ([server, , groupId, id]) => getExpense(server, groupId, id))
  if (expenseId && isLoading) return <FormOverlay onClose={onClose}><div className="editor-loading"><span className="spinner" /> Loading expense…</div></FormOverlay>
  if (expenseId && (error || !data)) return <FormOverlay onClose={onClose}><div className="editor-loading"><p role="alert">{error?.message ?? "Couldn’t load this expense."}</p><button className="button button-ghost" onClick={onClose}>Close</button></div></FormOverlay>
  return <ExpenseFields key={expenseId ?? (settlement ? "settlement" : "new")} baseURL={baseURL} group={group} categories={categories} initial={data?.expense} expenseId={expenseId} settlement={settlement} participantId={participantId} onClose={onClose} onSaved={onSaved} />
}

function ExpenseFields({ baseURL, group, categories, initial, expenseId, settlement, participantId, onClose, onSaved }: { baseURL: string; group: Group; categories: Category[]; initial?: ExpenseDetails; expenseId?: string; settlement?: Reimbursement; participantId?: string; onClose: () => void; onSaved: () => void }) {
  const { mutate } = useSWRConfig()
  const [title, setTitle] = useState(initial?.title ?? (settlement ? "Reimbursement" : ""))
  const [amount, setAmount] = useState(initial ? (initial.amount / 10 ** minorUnitDigits(group.currencyCode)).toFixed(minorUnitDigits(group.currencyCode)) : settlement ? (settlement.amount / 10 ** minorUnitDigits(group.currencyCode)).toFixed(minorUnitDigits(group.currencyCode)) : "")
  const [date, setDate] = useState(initial?.expenseDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? (settlement ? 1 : 0))
  const [paidBy, setPaidBy] = useState(initial?.paidById ?? settlement?.from ?? participantId ?? group.participants[0]?.id ?? "")
  const [splitMode, setSplitMode] = useState<SplitMode>(initial?.splitMode ?? "EVENLY")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const isReimbursement = initial?.isReimbursement ?? Boolean(settlement)
  const [shares, setShares] = useState<ShareDraft[]>(() => group.participants.map((participant) => {
    const saved = initial?.paidFor.find((item) => item.participantId === participant.id)
    const included = settlement ? settlement.to === participant.id : initial ? Boolean(saved) : true
    return { participantId: participant.id, name: participant.name, included, value: saved ? String(saved.shares / 100) : "1" }
  }))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const digits = minorUnitDigits(group.currencyCode)
  const totalMinor = useMemo(() => amountToMinor(amount, digits), [amount, digits])
  const selected = shares.filter((share) => share.included)
  const calculatedTotal = useMemo(() => {
    if (splitMode === "BY_PERCENTAGE") return selected.reduce((sum, share) => sum + (Number(share.value) || 0), 0)
    if (splitMode === "BY_AMOUNT") return selected.reduce((sum, share) => sum + (amountToMinor(share.value, digits) ?? 0), 0)
    return selected.reduce((sum, share) => sum + (Number(share.value) || 0), 0)
  }, [digits, selected, splitMode])
  const splitValid = splitMode === "BY_AMOUNT" ? totalMinor !== null && calculatedTotal === totalMinor : splitMode === "BY_PERCENTAGE" ? Math.abs(calculatedTotal - 100) < 0.001 : splitMode === "BY_SHARES" ? selected.every((share) => Number(share.value) > 0) : true


  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError("")
    const trimmedTitle = title.trim()
    const minor = totalMinor
    if (trimmedTitle.length < 2) return setFormError("Enter a title with at least two characters.")
    if (!minor) return setFormError("Enter a valid amount greater than zero.")
    if (!paidBy || selected.length === 0) return setFormError("Choose who paid and at least one participant.")
    if (!splitValid) return setFormError(splitMode === "BY_AMOUNT" ? "Participant amounts need to add up to the total." : splitMode === "BY_PERCENTAGE" ? "Percentages need to add up to 100%." : "Enter a positive share for each participant.")
    const paidFor = selected.map((share) => {
      let amountValue = 100
      if (splitMode === "BY_SHARES" || splitMode === "BY_PERCENTAGE") amountValue = Math.round(Number(share.value) * 100)
      if (splitMode === "BY_AMOUNT") amountValue = amountToMinor(share.value, digits) ?? 0
      return { participant: share.participantId, shares: amountValue }
    })
    const values = {
      title: trimmedTitle,
      expenseDate: new Date(`${date}T00:00:00.000Z`),
      amount: minor,
      category: Number(categoryId) || 0,
      paidBy,
      paidFor,
      splitMode,
      saveDefaultSplittingOptions: false,
      isReimbursement,
      documents: initial?.documents ?? [],
      notes: notes.trim() || null,
      recurrenceRule: initial?.recurrenceRule ?? "NONE",
      originalAmount: "",
      originalCurrency: null,
      conversionRate: "",
    }
    setSaving(true)
    try {
      if (expenseId) await updateExpense(baseURL, group.id, expenseId, values, participantId)
      else await createExpense(baseURL, group.id, values, participantId)
      await mutate([baseURL, "expenses", group.id])
      await mutate([baseURL, "balances", group.id])
      await mutate((key) => Array.isArray(key) && key[0] === baseURL && key[1] === "stats" && key[2] === group.id)
      onSaved()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Couldn’t save this expense.")
    } finally {
      setSaving(false)
    }
  }

  return <FormOverlay onClose={onClose}><header className="modal-head"><div><div className="eyebrow muted">{isReimbursement ? "SETTLE UP" : "SHARED EXPENSE"}</div><h2>{expenseId ? "Edit expense" : isReimbursement ? "Record a payment" : "Add an expense"}</h2><p>{isReimbursement ? "Confirm the payment between these participants." : `Split the cost with ${group.name}.`}</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
    <form className="modal-form expense-form" onSubmit={save}>
      <label className="field-label" htmlFor="expense-title">What was it for?</label><input className="text-input" id="expense-title" autoFocus maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Dinner, groceries, tickets…" />
      <div className="field-row"><div className="field-grow"><label className="field-label" htmlFor="expense-amount">Amount <span className="currency-hint">{group.currencyCode ?? group.currency}</span></label><div className="money-input"><span>{group.currency}</span><input id="expense-amount" type="text" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></div><div className="field-grow"><label className="field-label" htmlFor="expense-date">Date</label><input className="text-input" id="expense-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
      <div className="field-row"><div className="field-grow"><label className="field-label" htmlFor="expense-category">Category</label><select className="text-input" id="expense-category" value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}><option value={0}>General</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.grouping} · {category.name}</option>)}</select></div><div className="field-grow"><label className="field-label" htmlFor="expense-payer">Paid by</label><select className="text-input" id="expense-payer" value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{group.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></div></div>
      <div className="split-head"><div><label className="field-label" htmlFor="split-mode">Split</label><p className="field-hint">Choose how everyone shares the total.</p></div><select className="text-input split-select" id="split-mode" value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)}>{Object.entries(splitLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className="split-list">{shares.map((share, index) => <div className={`split-person ${share.included ? "is-included" : ""}`} key={share.participantId}><label className="split-person-label"><input type="checkbox" checked={share.included} onChange={(event) => setShares((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, included: event.target.checked } : item))} /><span className="checkbox-art" /><span>{share.name}</span></label>{share.included && splitMode !== "EVENLY" && <div className="share-value"><input aria-label={`${splitLabels[splitMode]} for ${share.name}`} inputMode="decimal" value={share.value} onChange={(event) => setShares((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /><span>{splitMode === "BY_PERCENTAGE" ? "%" : splitMode === "BY_AMOUNT" ? group.currency : "share"}</span></div>}</div>)}</div>
      {splitMode === "BY_PERCENTAGE" && <div className={`allocation-note ${splitValid ? "allocation-good" : "allocation-warn"}`}>{splitValid ? "Percentages add up to 100%." : `${calculatedTotal.toFixed(2)}% of 100% allocated`}</div>}
      {splitMode === "BY_AMOUNT" && <div className={`allocation-note ${splitValid ? "allocation-good" : "allocation-warn"}`}>{splitValid ? "Amounts match the expense total." : `${group.currency}${(calculatedTotal / 10 ** digits).toFixed(digits)} allocated`}</div>}
      <label className="field-label" htmlFor="expense-notes">Notes <span className="optional">OPTIONAL</span></label><textarea className="text-input textarea" id="expense-notes" rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note for the group" />
      {initial?.documentCount ? <div className="document-note"><ReceiptText size={16} /> Existing receipt attached. It will stay with this expense.</div> : null}
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : expenseId ? "Save changes" : isReimbursement ? "Record payment" : "Save expense"}<ArrowRight size={15} /></button></div>
    </form></FormOverlay>
}

function FormOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card modal-wide" role="dialog" aria-modal="true">{children}</section></div>
}
