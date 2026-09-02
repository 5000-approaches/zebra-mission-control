import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @vercel/postgres before importing the module under test
vi.mock('@vercel/postgres', () => ({
  sql: vi.fn(),
}))

import { sql } from '@vercel/postgres'
import { createHandoff, listHandoffs } from '@/lib/db/handoffs'

const mockSql = sql as unknown as ReturnType<typeof vi.fn>

const SAMPLE_ROW = {
  id: 1,
  hubspot_deal_id: 'hs-deal-001',
  customer_name: 'Acme AS',
  contract_type: 'fixed',
  budget: 2500000,
  buffer_pct: 10,
  promises_json: [],
  action_items_json: [],
  meetings_json: [],
  sent_by_email: 'rune@5000approaches.io',
  received_at: '2026-06-10T01:00:00Z',
}

describe('createHandoff', () => {
  beforeEach(() => {
    mockSql.mockReset()
    // ensureTable call
    mockSql.mockResolvedValueOnce({ rows: [] })
    // insert call
    mockSql.mockResolvedValueOnce({ rows: [SAMPLE_ROW] })
  })

  it('returns the created row with id and received_at', async () => {
    const result = await createHandoff({
      hubspot_deal_id: 'hs-deal-001',
      customer_name: 'Acme AS',
      contract_type: 'fixed',
      budget: 2500000,
      buffer_pct: 10,
      promises_json: [],
      action_items_json: [],
      meetings_json: [],
    })
    expect(result.id).toBe(1)
    expect(result.hubspot_deal_id).toBe('hs-deal-001')
    expect(result.received_at).toBe('2026-06-10T01:00:00Z')
  })
})

describe('listHandoffs', () => {
  beforeEach(() => {
    mockSql.mockReset()
    // ensureTable call
    mockSql.mockResolvedValueOnce({ rows: [] })
    // select call
    mockSql.mockResolvedValueOnce({ rows: [SAMPLE_ROW] })
  })

  it('returns array of handoffs', async () => {
    const rows = await listHandoffs()
    expect(rows).toHaveLength(1)
    expect(rows[0].customer_name).toBe('Acme AS')
  })
})
