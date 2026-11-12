"use client"

import { useEffect } from "react"

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => void registration.unregister()))
      return
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
  }, [])
  return null
}
