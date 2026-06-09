import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createHandoff, listHandoffs } from '@/lib/db/handoffs'

export async function POST(request: NextRequest) {
  const apiKey = process.env.HANDOFF_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Handoff API not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    hubspot_deal_id?: string
    customer_name?: string
    contract_type?: string
    budget?: number
    buffer_pct?: number
    promises_json?: unknown[]
    action_items_json?: unknown[]
    meetings_json?: unknown[]
    sent_by_email?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { hubspot_deal_id, customer_name, contract_type, budget, buffer_pct } = body
  if (!hubspot_deal_id || !customer_name || !contract_type || budget == null || buffer_pct == null) {
    return NextResponse.json(
      { error: 'hubspot_deal_id, customer_name, contract_type, budget, and buffer_pct are required' },
      { status: 400 },
    )
  }

  try {
    const row = await createHandoff({
      hubspot_deal_id,
      customer_name,
      contract_type,
      budget,
      buffer_pct,
      promises_json: Array.isArray(body.promises_json) ? body.promises_json : [],
      action_items_json: Array.isArray(body.action_items_json) ? body.action_items_json : [],
      meetings_json: Array.isArray(body.meetings_json) ? body.meetings_json : [],
      sent_by_email: body.sent_by_email ?? null,
    })
    return NextResponse.json({ id: row.id, received_at: row.received_at })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save handoff' },
      { status: 500 },
    )
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await listHandoffs()
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch handoffs' },
      { status: 500 },
    )
  }
}
