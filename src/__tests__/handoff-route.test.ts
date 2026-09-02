import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/handoff/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/handoffs', () => ({
  createHandoff: vi.fn(),
  listHandoffs: vi.fn(),
}))

import { auth } from '@/auth'
import { createHandoff, listHandoffs } from '@/lib/db/handoffs'

const mockAuth = auth as ReturnType<typeof vi.fn>
const mockCreate = createHandoff as ReturnType<typeof vi.fn>
const mockList = listHandoffs as ReturnType<typeof vi.fn>

const VALID_BODY = {
  hubspot_deal_id: 'hs-deal-001',
  customer_name: 'Acme AS',
  contract_type: 'fixed',
  budget: 2500000,
  buffer_pct: 10,
  promises_json: [{ text: 'deliver by Q4' }],
  action_items_json: [],
  meetings_json: [],
  sent_by_email: 'seller@zebra.no',
}

function makePostReq(body: unknown, apiKey = 'secret-key'): NextRequest {
  return new NextRequest('http://localhost/api/handoff', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HANDOFF_API_KEY = 'secret-key'
  mockAuth.mockResolvedValue({ user: { email: 'admin@mc.no' } })
  mockCreate.mockResolvedValue({ id: 1, received_at: '2026-06-10T00:00:00Z' })
  mockList.mockResolvedValue([])
})

describe('POST /api/handoff', () => {
  it('returns 503 when HANDOFF_API_KEY is not configured', async () => {
    delete process.env.HANDOFF_API_KEY
    const res = await POST(makePostReq(VALID_BODY, 'any'))
    expect(res.status).toBe(503)
  })

  it('returns 401 when bearer token is wrong', async () => {
    const res = await POST(makePostReq(VALID_BODY, 'wrong-key'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makePostReq({ hubspot_deal_id: 'x' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/handoff', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-key' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with id and received_at on success', async () => {
    const res = await POST(makePostReq(VALID_BODY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(1)
    expect(json.received_at).toBe('2026-06-10T00:00:00Z')
  })

  it('passes correct payload to createHandoff', async () => {
    await POST(makePostReq(VALID_BODY))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        hubspot_deal_id: 'hs-deal-001',
        customer_name: 'Acme AS',
        contract_type: 'fixed',
        budget: 2500000,
        buffer_pct: 10,
        sent_by_email: 'seller@zebra.no',
      }),
    )
  })

  it('defaults optional arrays to [] when omitted', async () => {
    const { promises_json, action_items_json, meetings_json, ...minimal } = VALID_BODY
    await POST(makePostReq(minimal))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ promises_json: [], action_items_json: [], meetings_json: [] }),
    )
  })

  it('returns 500 when createHandoff throws', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'))
    const res = await POST(makePostReq(VALID_BODY))
    expect(res.status).toBe(500)
  })
})

describe('GET /api/handoff', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns handoffs list on success', async () => {
    const rows = [{ id: 1, customer_name: 'Acme AS' }]
    mockList.mockResolvedValue(rows)
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual(rows)
  })

  it('returns 500 when listHandoffs throws', async () => {
    mockList.mockRejectedValue(new Error('DB error'))
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
