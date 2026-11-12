const ALLOWED_PROCEDURES = new Set([
  "categories.list",
  "groups.list",
  "groups.get",
  "groups.getDetails",
  "groups.create",
  "groups.update",
  "groups.expenses.list",
  "groups.expenses.get",
  "groups.expenses.create",
  "groups.expenses.update",
  "groups.expenses.delete",
  "groups.balances.list",
  "groups.stats.overview",
  "groups.stats.get",
])
const MAX_BODY_BYTES = 1_048_576

async function forward(request: Request, params: Promise<{ procedure: string[] }>) {
  const { procedure: segments } = await params
  const procedure = segments.join(".")
  if (!ALLOWED_PROCEDURES.has(procedure)) {
    return Response.json({ error: { json: { message: "This Spliit procedure is not available." } } }, { status: 404 })
  }

  const incoming = new URL(request.url)
  const target = new URL(`https://spliit.app/api/trpc/${procedure}`)
  if (request.method === "GET") {
    const input = incoming.searchParams.get("input")
    if (input) target.searchParams.set("input", input)
  }

  const headers = new Headers({ Accept: "application/json" })
  let body: string | undefined
  if (request.method === "POST") {
    body = await request.text()
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: { json: { message: "The request is too large." } } }, { status: 413 })
    }
    headers.set("Content-Type", "application/json")
  }

  try {
    const upstream = await fetch(target, { method: request.method, headers, body, cache: "no-store", redirect: "manual" })
    if (upstream.status >= 300 && upstream.status < 400) {
      return Response.json({ error: { json: { message: "The Spliit server redirected this request." } } }, { status: 502 })
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return Response.json({ error: { json: { message: "Couldn’t connect to spliit.app." } } }, { status: 502 })
  }
}

export async function GET(request: Request, context: { params: Promise<{ procedure: string[] }> }) {
  return forward(request, context.params)
}

export async function POST(request: Request, context: { params: Promise<{ procedure: string[] }> }) {
  return forward(request, context.params)
}
