"use client"

import { useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { ArrowRight, ReceiptText, X } from "lucide-react"
import { ReceiptScanField } from "./receipt-scan-field"
import { createExpense, getExpense, updateExpense, type Category, type ExpenseDetails, type Group, type Reimbursement, type SplitMode } from "@/lib/spliit-api"
import { amountToMinor, minorUnitDigits } from "@/lib/format"

type ShareDraft = { participantId: string; name: string; included: boolean; value: string }
const splitLabels: Record<SplitMode, string> = { EVENLY: "Po równo", BY_SHARES: "Według udziałów", BY_PERCENTAGE: "Według procentów", BY_AMOUNT: "Według kwot" }
const categoryLabels: Record<string, string> = {
  Uncategorized: "Bez kategorii", General: "Ogólne", Payment: "Płatność", Other: "Inne",
  Entertainment: "Rozrywka", Games: "Gry", Movies: "Filmy", Music: "Muzyka", Sports: "Sport",
  "Food and Drink": "Jedzenie i napoje", "Dining Out": "Jedzenie na mieście", Groceries: "Zakupy spożywcze", Liquor: "Alkohol",
  Home: "Dom", Electronics: "Elektronika", Furniture: "Meble", "Household Supplies": "Artykuły domowe", Maintenance: "Naprawy i konserwacja", Mortgage: "Kredyt hipoteczny", Pets: "Zwierzęta", Rent: "Czynsz", Services: "Usługi",
  Life: "Życie", Childcare: "Opieka nad dziećmi", Clothing: "Odzież", Education: "Edukacja", Gifts: "Prezenty", Insurance: "Ubezpieczenie", "Medical Expenses": "Wydatki medyczne", Taxes: "Podatki", Donation: "Darowizna",
  Transportation: "Transport", Bicycle: "Rower", "Bus/Train": "Autobus / pociąg", Car: "Samochód", "Gas/Fuel": "Paliwo", Hotel: "Hotel", Parking: "Parking", Plane: "Samolot", Taxi: "Taksówka",
  Utilities: "Rachunki", Cleaning: "Sprzątanie", Electricity: "Prąd", "Heat/Gas": "Ogrzewanie / gaz", Trash: "Wywóz śmieci", "TV/Phone/Internet": "Telewizja / telefon / internet", Water: "Woda",
  Food: "Jedzenie", Restaurant: "Restauracja", Accommodation: "Nocleg", Activities: "Atrakcje", Shopping: "Zakupy", Health: "Zdrowie", Travel: "Podróże", Drinks: "Napoje",
}

function translateCategory(label: string) {
  return categoryLabels[label] ?? label
}

function categoryOptionLabel(category: Category) {
  const grouping = translateCategory(category.grouping)
  const name = translateCategory(category.name)
  return grouping === name ? name : `${grouping} · ${name}`
}

export function ExpenseForm({ baseURL, group, categories, expenseId, settlement, participantId, onClose, onSaved }: { baseURL: string; group: Group; categories: Category[]; expenseId?: string; settlement?: Reimbursement; participantId?: string; onClose: () => void; onSaved: () => void }) {
  const key = expenseId ? [baseURL, "expense", group.id, expenseId] as const : null
  const { data, error, isLoading } = useSWR(key, ([server, , groupId, id]) => getExpense(server, groupId, id))
  if (expenseId && isLoading) return <FormOverlay onClose={onClose}><div className="editor-loading"><span className="spinner" /> Wczytuję wydatek…</div></FormOverlay>
  if (expenseId && (error || !data)) return <FormOverlay onClose={onClose}><div className="editor-loading"><p role="alert">{error?.message ?? "Nie udało się wczytać wydatku."}</p><button className="button button-ghost" onClick={onClose}>Zamknij</button></div></FormOverlay>
  return <ExpenseFields key={expenseId ?? (settlement ? "settlement" : "new")} baseURL={baseURL} group={group} categories={categories} initial={data?.expense} expenseId={expenseId} settlement={settlement} participantId={participantId} onClose={onClose} onSaved={onSaved} />
}

function ExpenseFields({ baseURL, group, categories, initial, expenseId, settlement, participantId, onClose, onSaved }: { baseURL: string; group: Group; categories: Category[]; initial?: ExpenseDetails; expenseId?: string; settlement?: Reimbursement; participantId?: string; onClose: () => void; onSaved: () => void }) {
  const { mutate } = useSWRConfig()
  const [title, setTitle] = useState(initial?.title ?? (settlement ? "Zwrot" : ""))
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
  const [scanningReceipt, setScanningReceipt] = useState(false)
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
    if (trimmedTitle.length < 2) return setFormError("Opis wydatku musi mieć co najmniej 2 znaki.")
    if (!minor) return setFormError("Wpisz prawidłową kwotę większą od zera.")
    if (!paidBy || selected.length === 0) return setFormError("Wybierz osobę, która zapłaciła, i co najmniej jednego uczestnika.")
    if (!splitValid) return setFormError(splitMode === "BY_AMOUNT" ? "Kwoty uczestników muszą sumować się do całości." : splitMode === "BY_PERCENTAGE" ? "Procenty muszą sumować się do 100%." : "Podaj dodatnią liczbę udziałów dla każdej osoby.")

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
      setFormError(cause instanceof Error ? cause.message : "Nie udało się zapisać wydatku.")
    } finally {
      setSaving(false)
    }
  }

  return <FormOverlay onClose={onClose}>
    <header className="modal-head">
      <div><div className="eyebrow muted">{isReimbursement ? "ROZLICZENIE" : "WSPÓLNY WYDATEK"}</div><h2 id="expense-form-title">{expenseId ? "Edytuj wydatek" : isReimbursement ? "Zapisz zwrot" : "Dodaj wydatek"}</h2><p>{isReimbursement ? "Potwierdź płatność między uczestnikami." : "Podzielcie ten koszt między domowników."}</p></div>
      <button className="icon-button" aria-label="Zamknij" onClick={onClose}><X size={18} /></button>
    </header>
    <form className="modal-form expense-form" aria-labelledby="expense-form-title" onSubmit={(event) => void save(event)}>
      {!isReimbursement && <ReceiptScanField onScanningChange={setScanningReceipt} onRead={(receipt) => { if (receipt.title) setTitle(receipt.title); if (receipt.amount !== undefined) setAmount(receipt.amount.toFixed(digits).replace(".", ",")) }} />}
      <label className="field-label" htmlFor="expense-title">Za co był wydatek?</label><input className="text-input" id="expense-title" autoFocus maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Kolacja, zakupy, bilety…" />
      <div className="field-row"><div className="field-grow"><label className="field-label" htmlFor="expense-amount">Kwota <span className="currency-hint">{group.currencyCode ?? group.currency}</span></label><div className="money-input"><span>{group.currency}</span><input id="expense-amount" type="text" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></div></div><div className="field-grow"><label className="field-label" htmlFor="expense-date">Data</label><input className="text-input" id="expense-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
      <div className="field-row"><div className="field-grow"><label className="field-label" htmlFor="expense-category">Kategoria</label><select className="text-input" id="expense-category" value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}><option value={0}>Ogólne</option>{categories.filter((category) => category.id !== 0).map((category) => <option value={category.id} key={category.id}>{categoryOptionLabel(category)}</option>)}</select></div><div className="field-grow"><label className="field-label" htmlFor="expense-payer">Kto zapłacił?</label><select className="text-input" id="expense-payer" value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{group.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></div></div>
      <div className="split-head"><div><label className="field-label" htmlFor="split-mode">Podział kosztów</label><p className="field-hint">Wybierz sposób podziału kwoty.</p></div><select className="text-input split-select" id="split-mode" value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)}>{Object.entries(splitLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className="split-list">{shares.map((share, index) => <div className={`split-person ${share.included ? "is-included" : ""}`} key={share.participantId}><label className="split-person-label"><input type="checkbox" checked={share.included} onChange={(event) => setShares((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, included: event.target.checked } : item))} /><span className="checkbox-art" /><span>{share.name}</span></label>{share.included && splitMode !== "EVENLY" && <div className="share-value"><input aria-label={`${splitLabels[splitMode]} dla: ${share.name}`} inputMode="decimal" value={share.value} onChange={(event) => setShares((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /><span>{splitMode === "BY_PERCENTAGE" ? "%" : splitMode === "BY_AMOUNT" ? group.currency : "udz."}</span></div>}</div>)}</div>
      {splitMode === "BY_PERCENTAGE" && <div className={`allocation-note ${splitValid ? "allocation-good" : "allocation-warn"}`}>{splitValid ? "Udziały procentowe sumują się do 100%." : `${calculatedTotal.toFixed(2)}% z 100% zostało przydzielone`}</div>}
      {splitMode === "BY_AMOUNT" && <div className={`allocation-note ${splitValid ? "allocation-good" : "allocation-warn"}`}>{splitValid ? "Kwoty zgadzają się z sumą wydatku." : `Przydzielono ${group.currency}${(calculatedTotal / 10 ** digits).toFixed(digits)}`}</div>}
      <label className="field-label" htmlFor="expense-notes">Notatka <span className="optional">OPCJONALNIE</span></label><textarea className="text-input textarea" id="expense-notes" rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Dodaj informację dla domowników" />
      {initial?.documentCount ? <div className="document-note"><ReceiptText size={16} /> Do tego wydatku jest już dołączony paragon. Pozostanie przy wydatku.</div> : null}
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Anuluj</button><button className="button button-primary" disabled={saving || scanningReceipt}>{saving ? "Zapisywanie…" : expenseId ? "Zapisz zmiany" : isReimbursement ? "Zapisz zwrot" : "Zapisz wydatek"}<ArrowRight size={15} /></button></div>
    </form>
  </FormOverlay>
}

function FormOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card modal-wide" role="dialog" aria-modal="true" aria-label="Formularz wydatku">{children}</section></div>
}
