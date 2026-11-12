"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import useSWR, { useSWRConfig } from "swr"
import { ArrowRight, Check, Link2, Smartphone, Users, WalletCards } from "lucide-react"
import { getGroup } from "@/lib/spliit-api"
import { avatarColor } from "@/lib/format"
import { getRecentGroups, rememberGroup, type RecentGroup } from "@/lib/storage"

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

export function HomeWorkspace() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data: groups = [], isLoading } = useSWR<RecentGroup[]>("recent-groups", getRecentGroups)
  const group = groups[0]
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [replaceGroup, setReplaceGroup] = useState(false)
  const installPrompt = useInstallPrompt()

  async function joinGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")

    try {
      const parsed = new URL(url.trim())
      const match = parsed.pathname.match(/\/groups\/([^/?#]+)/)
      if (!match) throw new Error("Wklej link zawierający ścieżkę /groups/ oraz identyfikator grupy.")

      const basePath = parsed.pathname.split("/groups/")[0] || "/"
      const instanceURL = `${parsed.origin}${basePath.endsWith("/") ? basePath : `${basePath}/`}`
      const { group: joinedGroup } = await getGroup(instanceURL, decodeURIComponent(match[1]))
      if (!joinedGroup) throw new Error("Nie znaleziono tej grupy na wskazanym serwerze Spliit.")

      await rememberGroup({ groupId: joinedGroup.id, groupName: joinedGroup.name, instanceURL })
      await mutate("recent-groups")
      router.push(`/groups/${encodeURIComponent(joinedGroup.id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nie udało się otworzyć grupy.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="home-shell">
      <header className="home-topbar">
        <Link className="brand-lockup home-brand" href="/" aria-label="Rachuneczki — strona główna">
          <span className="brand-mark"><WalletCards size={19} strokeWidth={2.2} /></span>
          <span className="brand-wordmark">Rachuneczki</span>
        </Link>
        {installPrompt && (
          <button className="install-button" onClick={() => void installPrompt.prompt()}>
            <Smartphone size={16} /> Zainstaluj
          </button>
        )}
      </header>

      <section className="home-content" aria-labelledby="home-title">
        <div className="home-kicker"><span className="eyebrow-dot" /> WSPÓLNE WYDATKI, BEZ CHAOSU</div>
        <h1 id="home-title">Wszystkie rozliczenia w jednym miejscu.</h1>
        <p className="home-lead">Dodawajcie wydatki, sprawdzajcie saldo i łatwo ustalajcie, kto komu oddaje pieniądze.</p>

        {isLoading ? (
          <div className="home-loading" role="status"><span className="spinner" /> Wczytuję Twoją grupę…</div>
        ) : group && !replaceGroup ? (
          <section className="single-group-card" aria-labelledby="current-group-title">
            <div className="single-group-topline"><span className="eyebrow muted">TWOJA JEDYNA GRUPA</span><span className="single-group-status"><span /> Aktywna</span></div>
            <div className="single-group-details">
              <span className="group-avatar single-group-avatar" style={{ backgroundColor: avatarColor(group.groupId) }}>{group.groupName.slice(0, 1).toUpperCase()}</span>
              <div className="single-group-copy">
                <h2 id="current-group-title">{group.groupName}</h2>
                <span><Users size={14} /> Grupa Spliit</span>
              </div>
            </div>
            <Link className="button button-primary single-group-open" href={`/groups/${encodeURIComponent(group.groupId)}`}>
              Otwórz grupę <ArrowRight size={16} />
            </Link>
            <button className="change-group-button" onClick={() => { setReplaceGroup(true); setError("") }}>
              Dołącz do innej grupy
            </button>
          </section>
        ) : (
          <section className="join-panel" aria-labelledby="join-title">
            <div className="join-panel-heading">
              <span className="join-panel-icon"><Link2 size={19} /></span>
              <div>
                <h2 id="join-title">{group ? "Podmień obecną grupę" : "Dołącz do swojej grupy"}</h2>
                <p>Wklej link otrzymany od osoby, która utworzyła grupę.</p>
              </div>
            </div>
            <form className="join-form" onSubmit={(event) => void joinGroup(event)}>
              <label className="field-label" htmlFor="group-link">Link do grupy</label>
              <div className="home-link-input">
                <Link2 size={17} aria-hidden="true" />
                <input id="group-link" required type="url" inputMode="url" autoComplete="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…/groups/ID" />
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-primary join-submit" disabled={busy || !url.trim()}>
                {busy ? "Sprawdzam link…" : "Otwórz grupę"}<ArrowRight size={16} />
              </button>
              {group && <button type="button" className="change-group-button" onClick={() => { setReplaceGroup(false); setUrl(""); setError("") }}>Wróć do obecnej grupy</button>}
            </form>
            <p className="join-note"><Check size={15} /> Jedna grupa na urządzeniu. Nowy link zastąpi poprzednią.</p>
          </section>
        )}

        <p className="home-footnote"><Check size={15} /> Bez konta. Dane grupy pozostają na jej serwerze Spliit.</p>
      </section>
    </main>
  )
}
