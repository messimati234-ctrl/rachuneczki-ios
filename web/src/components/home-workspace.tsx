"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { ArrowRight, Check, ChevronDown, CircleHelp, Compass, ExternalLink, FolderArchive, Link2, Plus, Settings2, ShieldCheck, Smartphone, Sparkles, Star, Trash2, Users, WalletCards, X } from "lucide-react"
import { createGroup, getGroup, listGroups, OFFICIAL_INSTANCE, type GroupSummary } from "@/lib/spliit-api"
import { avatarColor } from "@/lib/format"
import { forgetGroup, getDefaultInstance, getRecentGroups, rememberGroup, setDefaultInstance, updateRecentGroup, type RecentGroup } from "@/lib/storage"

function useInstallPrompt() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null)
  useEffect(() => {
    const handle = (event: Event) => {
      event.preventDefault()
      setPrompt(event as Event & { prompt: () => Promise<void> })
    }
    window.addEventListener("beforeinstallprompt", handle)
    return () => window.removeEventListener("beforeinstallprompt", handle)
  }, [])
  return prompt
}

function groupSummariesFetcher(_: string, serializedGroups: string) {
  const groups = JSON.parse(serializedGroups) as Pick<RecentGroup, "groupId" | "instanceURL">[]
  const instances = new Map<string, string[]>()
  for (const group of groups) instances.set(group.instanceURL, [...(instances.get(group.instanceURL) ?? []), group.groupId])
  return Promise.all([...instances].map(async ([instance, ids]) => {
    const response = await listGroups(instance, ids)
    return response.groups
  })).then((lists) => Object.fromEntries(lists.flat().map((group) => [group.id, group])))
}

export function HomeWorkspace() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data: groups = [], isLoading } = useSWR<RecentGroup[]>("recent-groups", getRecentGroups)
  const { data: defaultInstance = OFFICIAL_INSTANCE } = useSWR("default-instance", getDefaultInstance)
  const summaryKey = useMemo(() => groups.length ? ["group-summaries", JSON.stringify(groups.map(({ groupId, instanceURL }) => ({ groupId, instanceURL })))] as const : null, [groups])
  const { data: summaries } = useSWR<Record<string, GroupSummary>>(
    summaryKey,
    ([key, serialized]) => groupSummariesFetcher(String(key), String(serialized)),
    { revalidateOnFocus: false },
  )
  const [modal, setModal] = useState<"create" | "join" | "settings" | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState("")
  const installPrompt = useInstallPrompt()

  const visibleGroups = groups.filter((group) => !group.archived && group.groupName.toLowerCase().includes(search.toLowerCase()))
  const starred = visibleGroups.filter((group) => group.starred)
  const recent = visibleGroups.filter((group) => !group.starred)

  async function refreshGroups() {
    await mutate("recent-groups")
  }

  async function joinGroup(input: string) {
    setBusy(true)
    setError("")
    try {
      const parsed = new URL(input.trim())
      const match = parsed.pathname.match(/\/groups\/([^/?#]+)/)
      if (!match) throw new Error("Paste a link containing /groups/ and a group ID.")
      const base = `${parsed.origin}${parsed.pathname.split("/groups/")[0] || "/"}`
      const instanceURL = base.endsWith("/") ? base : `${base}/`
      const { group } = await getGroup(instanceURL, decodeURIComponent(match[1]))
      if (!group) throw new Error("That group wasn’t found on this Spliit server.")
      await rememberGroup({ groupId: group.id, groupName: group.name, instanceURL })
      await refreshGroups()
      setModal(null)
      router.push(`/groups/${encodeURIComponent(group.id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t open this group.")
    } finally {
      setBusy(false)
    }
  }

  async function createNewGroup(values: { name: string; currency: string; currencyCode: string; information: string; participants: string[]; server: string }) {
    setBusy(true)
    setError("")
    try {
      const server = await setDefaultInstance(values.server)
      const response = await createGroup(server, {
        name: values.name.trim(),
        information: values.information.trim() || null,
        currency: values.currency,
        currencyCode: values.currencyCode,
        participants: values.participants.filter(Boolean).map((name) => ({ name: name.trim() })),
      })
      await rememberGroup({ groupId: response.groupId, groupName: values.name.trim(), instanceURL: server })
      await refreshGroups()
      setModal(null)
      router.push(`/groups/${encodeURIComponent(response.groupId)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t create the group.")
    } finally {
      setBusy(false)
    }
  }

  async function groupAction(group: RecentGroup, action: "star" | "archive" | "remove") {
    if (action === "remove" && !window.confirm(`Remove “${group.groupName}” from this device? This doesn’t delete the group.`)) return
    if (action === "remove") await forgetGroup(group.groupId)
    else if (action === "star") await updateRecentGroup(group.groupId, { starred: !group.starred })
    else await updateRecentGroup(group.groupId, { archived: !group.archived })
    await refreshGroups()
  }

  return (
    <main className="app-frame">
      <aside className="side-rail">
        <Link className="brand-lockup" href="/" aria-label="Spliit home">
          <Image src="/spliit-logo.png" alt="Spliit" width={522} height={180} priority />
        </Link>
        <div className="side-caption">YOUR SPACE</div>
        <Link className="side-link active" href="/"><WalletCards size={17} /> Groups <span className="nav-count">{groups.length}</span></Link>
        <button className="side-link" onClick={() => setModal("join")}><Link2 size={17} /> Join a group</button>
        <div className="side-divider" />
        <div className="side-caption side-caption-row">RECENT GROUPS <span>{groups.filter((group) => !group.archived).length}</span></div>
        <div className="rail-groups">
          {groups.filter((group) => !group.archived).slice(0, 6).map((group) => (
            <Link className="rail-group" href={`/groups/${encodeURIComponent(group.groupId)}`} key={group.groupId}>
              <span className="mini-avatar" style={{ backgroundColor: avatarColor(group.groupId) }}>{group.groupName.slice(0, 1).toUpperCase()}</span>
              <span>{group.groupName}</span>
              {group.starred && <Star size={12} fill="currentColor" />}
            </Link>
          ))}
          {!groups.length && <p className="rail-empty">Your group list will appear here.</p>}
        </div>
        <div className="side-bottom">
          {installPrompt && <button className="side-link install-link" onClick={async () => { await installPrompt.prompt(); }}><Smartphone size={17} /> Install Spliit</button>}
          <button className="side-link" onClick={() => { setError(""); setModal("settings") }}><Settings2 size={17} /> Settings</button>
          <div className="server-chip"><span className="status-dot" /> Connected to <strong>{new URL(defaultInstance).hostname}</strong></div>
        </div>
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Groups</strong></div>
          <div className="top-actions">
            <button className="icon-button mobile-settings" aria-label="Settings" onClick={() => { setError(""); setModal("settings") }}><Settings2 size={16} /></button>
            <button className="quiet-button" onClick={() => { setError(""); setModal("join") }}><Link2 size={16} /> <span>Join a group</span></button>
            <button className="button button-primary button-small" onClick={() => { setError(""); setModal("create") }}><Plus size={16} /> Create group</button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-hero">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-dot" /> SHARED, NOT COMPLICATED</div>
              <h1>Good spending.<br /><span>Clear between you.</span></h1>
              <p>Keep every shared expense in one place. Spliit works out who owes what, so your group can get back to the good part.</p>
              <div className="hero-actions">
                <button className="button button-primary" onClick={() => { setError(""); setModal("create") }}><Plus size={17} /> Create a group <ArrowRight size={16} /></button>
                <button className="button button-ghost" onClick={() => { setError(""); setModal("join") }}><Link2 size={16} /> Add with a link</button>
              </div>
              <div className="hero-note"><ShieldCheck size={15} /> No account needed. Your group stays on its Spliit server.</div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
              <div className="balance-card card-back"><div className="art-lines"><span /><span /></div><div className="art-number">Shared cost</div><div className="art-caption">paid together</div></div>
              <div className="balance-card card-front"><div className="art-card-top"><span className="art-icon"><Users size={15} /></span><span className="art-tag">SETTLED</span></div><div className="art-number">All settled</div><div className="art-caption">the group is even</div><div className="art-progress"><span /></div></div>
              <span className="art-person person-one">M</span><span className="art-person person-two">J</span><span className="art-star"><Sparkles size={20} /></span>
            </div>
          </section>

          <div className="section-head">
            <div><div className="eyebrow muted">YOUR SPLIIT SPACE</div><h2>Your groups <span className="count-pill">{groups.length}</span></h2></div>
            {groups.length > 2 && <label className="search-box"><Compass size={15} /><input aria-label="Search groups" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a group" /></label>}
          </div>

          {error && !modal && <div role="alert" className="inline-error">{error}</div>}
          {isLoading ? <div className="skeleton-list"><span /><span /><span /></div> : groups.length === 0 ? (
            <section className="empty-groups">
              <div className="empty-symbol"><WalletCards size={25} /></div>
              <div><h3>Your first group starts here</h3><p>Make a group for a trip, a flat, or the next dinner out. Everyone can join from a shared link.</p></div>
              <button className="button button-primary" onClick={() => setModal("create")}><Plus size={16} /> Create your first group</button>
            </section>
          ) : (
            <div className="group-collection">
              {starred.length > 0 && <GroupSection title="Starred" groups={starred} summaries={summaries} onAction={groupAction} />}
              <GroupSection title={starred.length ? "Recent groups" : "All groups"} groups={recent} summaries={summaries} onAction={groupAction} />
              {groups.some((group) => group.archived) && <details className="archived-groups"><summary><FolderArchive size={15} /> Archived <ChevronDown size={14} /></summary><div className="group-list">{groups.filter((group) => group.archived).map((group) => <GroupCard key={group.groupId} group={group} summary={summaries?.[group.groupId]} onAction={groupAction} />)}</div></details>}
            </div>
          )}

          <footer className="page-footer"><span>Made for the moments you share.</span><a href="https://spliit.app" target="_blank" rel="noreferrer">About Spliit <ExternalLink size={12} /></a></footer>
        </div>
      </section>

      {modal === "join" && <JoinDialog busy={busy} error={error} onClose={() => { setModal(null); setError("") }} onJoin={joinGroup} />}
      {modal === "create" && <CreateDialog busy={busy} error={error} server={defaultInstance} onClose={() => { setModal(null); setError("") }} onCreate={createNewGroup} />}
      {modal === "settings" && <SettingsDialog defaultInstance={defaultInstance} onClose={() => setModal(null)} onSaved={async (value) => { await setDefaultInstance(value); await mutate("default-instance", value); setModal(null) }} />}
    </main>
  )
}

function GroupSection({ title, groups, summaries, onAction }: { title: string; groups: RecentGroup[]; summaries?: Record<string, GroupSummary>; onAction: (group: RecentGroup, action: "star" | "archive" | "remove") => void }) {
  return <section className="group-section"><div className="group-section-title"><h3>{title}</h3><span>{groups.length}</span></div><div className="group-list">{groups.map((group) => <GroupCard key={group.groupId} group={group} summary={summaries?.[group.groupId]} onAction={onAction} />)}</div></section>
}

function GroupCard({ group, summary, onAction }: { group: RecentGroup; summary?: GroupSummary; onAction: (group: RecentGroup, action: "star" | "archive" | "remove") => void }) {
  return <article className="group-card">
    <Link className="group-card-main" href={`/groups/${encodeURIComponent(group.groupId)}`}>
      <span className="group-avatar" style={{ backgroundColor: avatarColor(group.groupId) }}>{group.groupName.slice(0, 1).toUpperCase()}</span>
      <span className="group-info"><strong>{group.groupName}</strong><span><Users size={13} /> {summary?.participantCount ?? "—"} people <i /> {summary?.createdAt ? new Date(summary.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : new URL(group.instanceURL).hostname}</span></span>
      <span className="group-currency">{summary?.currency ?? ""}</span><ArrowRight className="group-arrow" size={17} />
    </Link>
    <div className="group-card-actions">
      <button aria-label={group.starred ? `Unstar ${group.groupName}` : `Star ${group.groupName}`} title={group.starred ? "Unstar" : "Star"} onClick={() => onAction(group, "star")}><Star size={15} fill={group.starred ? "currentColor" : "none"} /></button>
      <button aria-label={group.archived ? `Unarchive ${group.groupName}` : `Archive ${group.groupName}`} title={group.archived ? "Unarchive" : "Archive"} onClick={() => onAction(group, "archive")}><FolderArchive size={15} /></button>
      <button aria-label={`Remove ${group.groupName} from this device`} title="Remove from this device" onClick={() => onAction(group, "remove")}><Trash2 size={15} /></button>
    </div>
  </article>
}

function DialogFrame({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header className="modal-head"><div><div className="eyebrow muted">SPLIIT</div><h2 id="dialog-title">{title}</h2><p>{description}</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>{children}</section></div>
}

function JoinDialog({ busy, error, onClose, onJoin }: { busy: boolean; error: string; onClose: () => void; onJoin: (url: string) => void }) {
  const [url, setUrl] = useState("")
  return <DialogFrame title="Join a group" description="Paste a Spliit link shared by someone in your group." onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); onJoin(url) }}><label className="field-label" htmlFor="group-link">Group link</label><div className="input-with-icon"><Link2 size={17} /><input id="group-link" autoFocus required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://spliit.app/groups/…" /></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !url.trim()}>{busy ? "Checking link…" : "Open group"}<ArrowRight size={15} /></button></div><p className="field-hint"><CircleHelp size={14} /> Links from self-hosted Spliit servers work too.</p></form></DialogFrame>
}

function CreateDialog({ busy, error, server, onClose, onCreate }: { busy: boolean; error: string; server: string; onClose: () => void; onCreate: (values: { name: string; currency: string; currencyCode: string; information: string; participants: string[]; server: string }) => void }) {
  const [name, setName] = useState("")
  const [currencyCode, setCurrencyCode] = useState("USD")
  const [currency, setCurrency] = useState("$")
  const [information, setInformation] = useState("")
  const [participants, setParticipants] = useState(["", ""])
  const [instance, setInstance] = useState(server)
  const [formError, setFormError] = useState("")
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", CHF: "CHF", PLN: "zł", JPY: "¥", AUD: "A$" }
  return <DialogFrame title="Create a group" description="Choose a name and add the people you share with." onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const names = participants.map((item) => item.trim()).filter(Boolean); if (name.trim().length < 2) return setFormError("Enter a group name with at least two characters."); if (!names.length || names.some((item) => item.length < 2)) return setFormError("Add at least one participant with a name of two or more characters."); if (new Set(names.map((item) => item.toLowerCase())).size !== names.length) return setFormError("Participant names must be unique."); setFormError(""); onCreate({ name, currency, currencyCode, information, participants: names, server: instance }) }}>
    <label className="field-label" htmlFor="group-name">Group name</label><input className="text-input" id="group-name" autoFocus required maxLength={50} value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekend in Lisbon" />
    <div className="field-row"><div className="field-grow"><label className="field-label" htmlFor="currency-code">Currency</label><select className="text-input" id="currency-code" value={currencyCode} onChange={(event) => { setCurrencyCode(event.target.value); setCurrency(symbols[event.target.value] ?? event.target.value) }}><option value="USD">US dollar · USD</option><option value="EUR">Euro · EUR</option><option value="GBP">Pound sterling · GBP</option><option value="PLN">Polish złoty · PLN</option><option value="CHF">Swiss franc · CHF</option><option value="CAD">Canadian dollar · CAD</option><option value="JPY">Japanese yen · JPY</option><option value="AUD">Australian dollar · AUD</option></select></div><div className="field-symbol"><label className="field-label" htmlFor="currency-symbol">Symbol</label><input className="text-input" id="currency-symbol" required maxLength={5} value={currency} onChange={(event) => setCurrency(event.target.value)} /></div></div>
    <label className="field-label" htmlFor="group-notes">Group note <span className="optional">OPTIONAL</span></label><textarea className="text-input textarea" id="group-notes" value={information} onChange={(event) => setInformation(event.target.value)} placeholder="A little context for the group" rows={2} />
    <div className="field-label participants-label">Participants <span className="optional">YOU CAN ADD MORE LATER</span></div><div className="participant-fields">{participants.map((participant, index) => <div className="participant-field" key={index}><span className="mini-avatar participant-mini" style={{ backgroundColor: avatarColor(`participant-${index}`) }}>{index + 1}</span><input className="text-input" aria-label={`Participant ${index + 1}`} value={participant} onChange={(event) => setParticipants((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={index === 0 ? "Your name" : "Participant name"} />{participants.length > 1 && <button type="button" className="remove-participant" aria-label={`Remove participant ${index + 1}`} onClick={() => setParticipants((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>}</div>)}</div><button type="button" className="text-action add-person" onClick={() => setParticipants((current) => [...current, ""])}><Plus size={15} /> Add participant</button>
    <label className="field-label" htmlFor="create-instance">Spliit server</label><input className="text-input" id="create-instance" required type="url" value={instance} onChange={(event) => setInstance(event.target.value)} />
    {(formError || error) && <p className="form-error" role="alert">{formError || error}</p>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Creating…" : "Create group"}<ArrowRight size={15} /></button></div><p className="field-hint"><ShieldCheck size={14} /> No account needed. The group is created on the server above.</p>
  </form></DialogFrame>
}

function SettingsDialog({ defaultInstance, onClose, onSaved }: { defaultInstance: string; onClose: () => void; onSaved: (value: string) => Promise<void> }) {
  const [instance, setInstance] = useState(defaultInstance)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  return <DialogFrame title="Settings" description="Choose the server for new groups. Each existing group keeps its own server." onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try { await onSaved(instance) } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t save settings.") } finally { setSaving(false) } }}><label className="field-label" htmlFor="default-server">Default Spliit server</label><input className="text-input" id="default-server" type="url" required value={instance} onChange={(event) => setInstance(event.target.value)} />{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save settings"}<Check size={15} /></button></div></form></DialogFrame>
}
