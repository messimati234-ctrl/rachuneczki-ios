"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import useSWRInfinite from "swr/infinite"
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, ExternalLink, Info, List, LoaderCircle, Plus, RefreshCw, Search, Settings2, Share2, Users, WalletCards, X } from "lucide-react"
import { deleteExpense, getBalances, getGroup, getStats, listCategories, listExpenses, type Expense, type Reimbursement } from "@/lib/spliit-api"
import { avatarColor, formatMoney, initials } from "@/lib/format"
import { getDefaultInstance, getRecentGroup, updateRecentGroup } from "@/lib/storage"
import { ExpenseForm } from "@/components/expense-form"
import { GroupEditor } from "@/components/group-editor"

const tabs = [
  { id: "expenses", label: "Expenses", icon: List },
  { id: "balances", label: "Balances", icon: ArrowDownLeft },
  { id: "totals", label: "Totals", icon: BarChart3 },
  { id: "information", label: "Information", icon: Info },
] as const

type TabId = typeof tabs[number]["id"]

export function GroupWorkspace({ groupId }: { groupId: string }) {
  const { mutate } = useSWRConfig()
  const { data: reference, isLoading: loadingReference } = useSWR(["recent-group", groupId], ([, id]) => getRecentGroup(id))
  const { data: defaultInstance = "https://spliit.app/" } = useSWR("default-instance", getDefaultInstance)
  const baseURL = reference?.instanceURL ?? defaultInstance
  const [activeTab, setActiveTab] = useState<TabId>("expenses")
  const [modal, setModal] = useState<"new-expense" | "edit-expense" | "edit-group" | "settle" | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<string>()
  const [settlement, setSettlement] = useState<Reimbursement>()
  const [participantId, setParticipantId] = useState("")
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState("")

  const contextReady = !loadingReference
  const groupKey = contextReady ? [baseURL, "group", groupId] as const : null
  const { data: groupResult, error: groupError, isLoading: groupLoading } = useSWR(groupKey, ([server, , id]) => getGroup(server, id))
  const group = groupResult?.group
  const activeParticipant = group?.participants.find((participant) => participant.id === (reference?.participantId ?? participantId))
  const categoryKey = contextReady ? [baseURL, "categories"] as const : null
  const { data: categoryResult } = useSWR(categoryKey, ([server]) => listCategories(server), { revalidateOnFocus: false })
  const getExpensePageKey = (pageIndex: number, previous: { hasMore: boolean } | null) => {
    if (!contextReady || (pageIndex > 0 && !previous?.hasMore)) return null
    return [baseURL, "expenses", groupId, pageIndex * 20] as const
  }
  const { data: pages, size, setSize, isLoading: expensesLoading, mutate: mutateExpenses } = useSWRInfinite(
    getExpensePageKey,
    ([server, , id, cursor]) => listExpenses(server, id, cursor),
    { revalidateFirstPage: false },
  )
  const balanceKey = contextReady ? [baseURL, "balances", groupId] as const : null
  const { data: balanceData, error: balanceError, isLoading: balancesLoading, mutate: mutateBalances } = useSWR(balanceKey, ([server, , id]) => getBalances(server, id))
  const statsKey = contextReady && activeTab === "totals" ? [baseURL, "stats", groupId, activeParticipant?.id ?? ""] as const : null
  const { data: stats, error: statsError, isLoading: statsLoading } = useSWR(statsKey, ([server, , id, participant]) => getStats(server, id, participant || undefined))

  const expenses = pages?.flatMap((page) => page.expenses) ?? []
  const shownExpenses = expenses.filter((expense) => expense.title.toLowerCase().includes(query.toLowerCase()))
  const balances = balanceData?.balances ?? {}
  const reimbursements = balanceData?.reimbursements ?? []
  const largestBalance = Math.max(1, ...Object.values(balances).map((balance) => Math.abs(balance.total)))
  const dateSections = useMemo(() => bucketExpenses(shownExpenses), [shownExpenses])

  async function refresh() {
    await Promise.all([mutate([baseURL, "group", groupId]), mutateExpenses(), mutateBalances(), mutate((key) => Array.isArray(key) && key[0] === baseURL && key[1] === "stats" && key[2] === groupId)])
    setNotice("Group data refreshed.")
    window.setTimeout(() => setNotice(""), 2200)
  }

  async function identify(id: string) {
    setParticipantId(id)
    await updateRecentGroup(groupId, { participantId: id })
    await mutate(["recent-group", groupId])
    setNotice("You are now set for this group.")
    window.setTimeout(() => setNotice(""), 2200)
  }

  async function shareGroup() {
    const url = `${baseURL.replace(/\/$/, "")}/groups/${encodeURIComponent(groupId)}`
    try {
      if (navigator.share) await navigator.share({ title: group?.name ?? "Spliit group", url })
      else { await navigator.clipboard.writeText(url); setNotice("Group link copied to clipboard."); window.setTimeout(() => setNotice(""), 2200) }
    } catch {
      setNotice("Couldn’t share the group link.")
    }
  }

  async function removeExpense(expense: Expense) {
    if (!window.confirm(`Delete “${expense.title}”? This can’t be undone.`)) return
    try {
      await deleteExpense(baseURL, groupId, expense.id, reference?.participantId)
      await mutateExpenses()
      await mutateBalances()
      await mutate((key) => Array.isArray(key) && key[0] === baseURL && key[1] === "stats" && key[2] === groupId)
      setNotice("Expense deleted.")
      window.setTimeout(() => setNotice(""), 2200)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn’t delete this expense.")
    }
  }

  function openEdit(expenseId: string) {
    setSelectedExpense(expenseId)
    setSettlement(undefined)
    setModal("edit-expense")
  }

  function openSettlement(payment: Reimbursement) {
    setSettlement(payment)
    setSelectedExpense(undefined)
    setModal("settle")
  }

  if (!contextReady || groupLoading) return <main className="loading-screen"><span className="spinner" /><p>Opening your group…</p></main>
  if (groupError || !group) return <main className="error-screen"><Link className="brand-lockup error-brand" href="/"><Image src="/spliit-logo.png" alt="Spliit" width={522} height={180} /></Link><div className="empty-symbol"><CircleHelp size={24} /></div><h1>Couldn’t open this group</h1><p>{groupError?.message ?? "This group isn’t saved on this device, or it no longer exists on the selected server."}</p><div className="hero-actions"><Link href="/" className="button button-primary"><ArrowLeft size={16} /> Back to groups</Link><button className="button button-ghost" onClick={() => void mutate(groupKey)}><RefreshCw size={15} /> Try again</button></div></main>

  return <main className="group-app">
    <header className="group-topbar">
      <Link href="/" className="brand-lockup compact-brand" aria-label="Back to groups"><Image src="/spliit-logo.png" alt="Spliit" width={522} height={180} /></Link>
      <div className="group-crumb"><Link href="/">Groups</Link><span>/</span><strong>{group.name}</strong></div>
      <div className="group-top-actions"><button className="quiet-button hide-small" onClick={shareGroup}><Share2 size={16} /> Share</button><button className="icon-button" aria-label="Edit group" title="Edit group" onClick={() => setModal("edit-group")}><Settings2 size={17} /></button></div>
    </header>

    <div className="group-content">
      <section className="group-heading">
        <span className="group-avatar large-avatar" style={{ backgroundColor: avatarColor(group.id) }}>{group.name.slice(0, 1).toUpperCase()}</span>
        <div className="group-title-block"><div className="eyebrow muted">SHARED SPACE <i /> {new URL(baseURL).hostname}</div><h1>{group.name}</h1><div className="group-subline"><Users size={14} /> {group.participants.length} people <i /> <span>{group.currencyCode ?? group.currency}</span></div></div>
        <div className="heading-buttons"><button className="button button-ghost" onClick={shareGroup}><Share2 size={15} /> Share group</button><button className="button button-primary" onClick={() => { setSettlement(undefined); setSelectedExpense(undefined); setModal("new-expense") }}><Plus size={16} /> Add expense</button></div>
      </section>

      <nav className="group-tabs" aria-label="Group sections">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? "group-tab active" : "group-tab"} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined}><Icon size={16} />{label}{id === "expenses" && expenses.length > 0 && <span className="tab-count">{expenses.length}</span>}</button>)}</nav>

      {notice && <div className="toast-message" role="status"><Check size={15} /> {notice}</div>}

      {activeTab === "expenses" && <section className="workspace-section">
        <div className="panel-heading"><div><div className="eyebrow muted">THE LEDGER</div><h2>Expenses <span className="count-pill">{expenses.length}</span></h2><p>Everything the group has shared, newest first.</p></div><div className="panel-tools"><label className="search-box expense-search"><Search size={15} /><input aria-label="Search expenses" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" /></label><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh group data" title="Refresh"><RefreshCw size={16} /></button></div></div>
        {expensesLoading && !pages ? <div className="skeleton-list"><span /><span /><span /></div> : shownExpenses.length === 0 ? <div className="empty-panel"><div className="empty-symbol"><WalletCards size={22} /></div><h3>{query ? "No matching expenses" : "No expenses yet"}</h3><p>{query ? "Try another search term." : "Add the first expense and Spliit will work out who owes what."}</p>{!query && <button className="button button-primary" onClick={() => setModal("new-expense")}><Plus size={16} /> Add first expense</button>}</div> : <div className="expense-board">{dateSections.map((section) => <div className="expense-section" key={section.title}><div className="date-heading"><span>{section.title}</span><i /></div><div className="expense-list">{section.expenses.map((expense) => <article className="expense-card" key={expense.id}><button className="expense-main" onClick={() => openEdit(expense.id)}><span className="expense-icon">{expense.isReimbursement ? <ArrowRight size={18} /> : <WalletCards size={18} />}</span><span className="expense-info"><strong className={expense.isReimbursement ? "reimbursement-title" : ""}>{expense.title}</strong><span>{expense.isReimbursement ? "Payment" : `Paid by ${expense.paidBy.name}`} <i /> {expense.paidFor.map((item) => item.participant.name).join(", ") || "Group"}</span></span><span className="expense-date">{new Date(expense.expenseDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><strong className="expense-amount">{formatMoney(expense.amount, group)}</strong></button><button className="expense-delete" aria-label={`Delete ${expense.title}`} title="Delete expense" onClick={() => void removeExpense(expense)}><span>Delete</span><X size={15} /></button></article>)}</div></div>)}
          {pages?.at(-1)?.hasMore && <button className="load-more" disabled={expensesLoading} onClick={() => void setSize(size + 1)}>{expensesLoading ? <><LoaderCircle size={16} className="spin" /> Loading…</> : <>Load more expenses <ChevronDown size={15} /></>}</button>}
        </div>}
      </section>}

      {activeTab === "balances" && <section className="workspace-section">
        <div className="panel-heading"><div><div className="eyebrow muted">SETTLE UP</div><h2>Balances</h2><p>See where everyone stands and how to close the loop.</p></div><button className="icon-button" onClick={() => void mutateBalances()} aria-label="Refresh balances"><RefreshCw size={16} /></button></div>
        {balancesLoading ? <div className="skeleton-list"><span /><span /><span /></div> : balanceError ? <div className="inline-error" role="alert">{balanceError.message}</div> : <>
          <section className="your-balance-card"><div className="your-balance-copy"><div className="eyebrow">YOUR PLACE IN THIS GROUP</div><h3>{activeParticipant ? `Hi, ${activeParticipant.name}.` : "Where do you fit in?"}</h3><p>{activeParticipant ? "Your balance is ready whenever you need it." : "Choose your name once to see your balance and prefill new expenses."}</p></div>{activeParticipant && <div className={`your-balance-amount ${(balances[activeParticipant.id]?.total ?? 0) > 0 ? "positive" : (balances[activeParticipant.id]?.total ?? 0) < 0 ? "negative" : ""}`}><span>{(balances[activeParticipant.id]?.total ?? 0) > 0 ? "You are owed" : (balances[activeParticipant.id]?.total ?? 0) < 0 ? "You owe" : "You’re settled up"}</span><strong>{formatMoney(Math.abs(balances[activeParticipant.id]?.total ?? 0), group)}</strong></div>}<label className="identity-select"><span>I am</span><select aria-label="Choose yourself in this group" value={activeParticipant?.id ?? ""} onChange={(event) => void identify(event.target.value)}><option value="">Choose a participant</option>{group.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label></section>
          <div className="balance-layout"><section className="surface-card balance-card"><div className="card-title"><div><h3>Group balances</h3><p>Who is up and who is down.</p></div><span className="subtle-pill"><Users size={13} /> {group.participants.length}</span></div><div className="balance-list">{group.participants.map((person, index) => { const balance = balances[person.id]?.total ?? 0; const width = Math.abs(balance) / largestBalance * 50; return <div className="balance-person" key={person.id}><span className="mini-avatar" style={{ backgroundColor: avatarColor(`${group.id}-${index}`) }}>{initials(person.name)}</span><div className="balance-person-content"><div className="balance-person-head"><strong>{person.name}{person.id === activeParticipant?.id && <span className="you-tag">You</span>}</strong><strong className={balance > 0 ? "positive" : balance < 0 ? "negative" : "muted-amount"}>{formatMoney(balance, group)}</strong></div><div className="diverging-bar"><span className="bar-center" /><i className={balance >= 0 ? "bar-owed" : "bar-owes"} style={{ width: `${width}%`, left: balance < 0 ? `${50 - width}%` : "50%" }} /></div></div></div>})}</div><p className="card-footnote">Final balances are calculated from every expense in the group.</p></section>
            <section className="surface-card payment-card"><div className="card-title"><div><h3>Suggested payments</h3><p>The fewest payments to settle the group.</p></div><span className="subtle-pill">{reimbursements.length} {reimbursements.length === 1 ? "payment" : "payments"}</span></div>{reimbursements.length ? <div className="payment-list">{reimbursements.map((payment, index) => { const from = group.participants.find((person) => person.id === payment.from); const to = group.participants.find((person) => person.id === payment.to); return <article className="payment-row" key={`${payment.from}-${payment.to}-${index}`}><div className="payment-route"><span className="mini-avatar" style={{ backgroundColor: avatarColor(`${group.id}-${payment.from}`) }}>{initials(from?.name ?? "?")}</span><span className="payment-arrow"><ArrowRight size={15} /></span><span className="mini-avatar" style={{ backgroundColor: avatarColor(`${group.id}-${payment.to}`) }}>{initials(to?.name ?? "?")}</span></div><div className="payment-copy"><strong>{from?.name ?? "—"} pays {to?.name ?? "—"}</strong><span>{formatMoney(payment.amount, group)}</span></div><button className="button button-outline button-small" onClick={() => openSettlement(payment)}>Mark paid</button></article>})}</div> : <div className="settled-state"><span className="settled-icon"><Check size={17} /></span><div><strong>Everyone is settled up</strong><p>All group expenses have been accounted for.</p></div></div>}</section></div>
        </>}
      </section>}

      {activeTab === "totals" && <section className="workspace-section">
        <div className="panel-heading"><div><div className="eyebrow muted">AT A GLANCE</div><h2>Group totals</h2><p>What the group has spent and where it went.</p></div><button className="icon-button" onClick={() => void mutate((key) => Array.isArray(key) && key[0] === baseURL && key[1] === "stats" && key[2] === groupId)} aria-label="Refresh totals"><RefreshCw size={16} /></button></div>
        {statsLoading ? <div className="skeleton-list"><span /><span /></div> : statsError ? <div className="inline-error" role="alert">{statsError.message}</div> : stats ? <div className="totals-grid"><article className="total-card total-primary"><span className="total-icon"><WalletCards size={17} /></span><span className="eyebrow">TOTAL GROUP SPENDING</span><strong>{formatMoney(stats.totalGroupSpendings, group)}</strong><p>Across the full group history</p></article><article className="total-card"><span className="total-icon"><ArrowUpRight size={17} /></span><span className="eyebrow">YOU PAID</span><strong>{activeParticipant && stats.totalParticipantSpendings !== undefined ? formatMoney(stats.totalParticipantSpendings, group) : "—"}</strong><p>{activeParticipant ? `Paid by ${activeParticipant.name}` : "Choose who you are in Balances"}</p></article><article className="total-card"><span className="total-icon"><Users size={17} /></span><span className="eyebrow">YOUR SHARE</span><strong>{activeParticipant && stats.totalParticipantShare !== undefined ? formatMoney(Math.round(stats.totalParticipantShare), group) : "—"}</strong><p>{activeParticipant ? `Expenses assigned to ${activeParticipant.name}` : `${group.participants.length} people in this group`}</p></article></div> : <div className="empty-panel"><h3>Totals aren’t available</h3><p>This Spliit server may not support group statistics yet.</p></div>}
      </section>}

      {activeTab === "information" && <section className="workspace-section">
        <div className="panel-heading"><div><div className="eyebrow muted">THE PEOPLE & THE PLAN</div><h2>Group information</h2><p>People, details and the link to bring everyone in.</p></div><button className="button button-ghost" onClick={() => setModal("edit-group")}><Settings2 size={15} /> Edit group</button></div>
        <div className="info-layout"><section className="surface-card info-card"><div className="card-title"><div><h3>Participants</h3><p>{group.participants.length} people in this group</p></div><button className="icon-button" onClick={() => setModal("edit-group")} aria-label="Edit participants"><Settings2 size={15} /></button></div><div className="info-people">{group.participants.map((person, index) => <div className="info-person" key={person.id}><span className="group-avatar" style={{ backgroundColor: avatarColor(`${group.id}-${index}`) }}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.id === activeParticipant?.id ? "This is you" : "Group participant"}</small></span>{person.id === activeParticipant?.id && <span className="you-tag">You</span>}</div>)}</div></section><section className="surface-card info-card"><div className="card-title"><div><h3>About this group</h3><p>Details everyone can see.</p></div><WalletCards size={17} className="muted-icon" /></div><div className="about-rows"><div><span>Currency</span><strong>{group.currencyCode ? `${group.currency} · ${group.currencyCode}` : group.currency}</strong></div><div><span>Server</span><strong>{new URL(baseURL).hostname}</strong></div><div><span>Group ID</span><strong className="mono-text">{group.id}</strong></div>{group.information && <div className="about-note"><span>Note</span><p>{group.information}</p></div>}</div><button className="button button-outline share-info" onClick={shareGroup}><Share2 size={15} /> Share group link</button></section></div>
      </section>}

      <footer className="group-footer"><span>Every shared expense, all in one place.</span><a href="https://spliit.app" target="_blank" rel="noreferrer">About Spliit <ExternalLink size={12} /></a></footer>
    </div>

    {modal === "new-expense" && <ExpenseForm baseURL={baseURL} group={group} categories={categoryResult?.categories ?? []} participantId={activeParticipant?.id} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await refresh() }} />}
    {modal === "edit-expense" && selectedExpense && <ExpenseForm baseURL={baseURL} group={group} categories={categoryResult?.categories ?? []} expenseId={selectedExpense} participantId={activeParticipant?.id} onClose={() => setModal(null)} onSaved={async () => { setModal(null); setSelectedExpense(undefined); await refresh() }} />}
    {modal === "settle" && settlement && <ExpenseForm baseURL={baseURL} group={group} categories={categoryResult?.categories ?? []} settlement={settlement} participantId={activeParticipant?.id} onClose={() => setModal(null)} onSaved={async () => { setModal(null); setSettlement(undefined); await refresh() }} />}
    {modal === "edit-group" && <GroupEditor baseURL={baseURL} groupId={groupId} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await mutate(groupKey); await mutate([baseURL, "group-details", groupId]) }} />}
  </main>
}

function bucketExpenses(expenses: Expense[]) {
  const now = new Date()
  const startOfThisWeek = new Date(now)
  startOfThisWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  startOfThisWeek.setHours(0, 0, 0, 0)
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const groups = new Map<string, Expense[]>()
  for (const expense of expenses) {
    const date = new Date(expense.expenseDate)
    const title = date > now ? "Upcoming" : date >= startOfThisWeek ? "This week" : date >= startOfThisMonth ? "Earlier this month" : date >= startOfLastMonth ? "Last month" : date.getFullYear() === now.getFullYear() ? "Earlier this year" : date.getFullYear() === now.getFullYear() - 1 ? "Last year" : "Older"
    groups.set(title, [...(groups.get(title) ?? []), expense])
  }
  return [...groups].map(([title, sectionExpenses]) => ({ title, expenses: sectionExpenses }))
}
