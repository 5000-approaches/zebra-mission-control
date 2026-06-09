import { sql } from '@vercel/postgres'

export interface HandoffRow {
  id: number
  hubspot_deal_id: string
  customer_name: string
  contract_type: string
  budget: number
  buffer_pct: number
  promises_json: unknown[]
  action_items_json: unknown[]
  meetings_json: unknown[]
  sent_by_email: string | null
  received_at: string
}

export async function ensureHandoffsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS sales_handoffs (
      id               SERIAL PRIMARY KEY,
      hubspot_deal_id  TEXT NOT NULL UNIQUE,
      customer_name    TEXT NOT NULL,
      contract_type    VARCHAR NOT NULL,
      budget           NUMERIC NOT NULL,
      buffer_pct       NUMERIC NOT NULL,
      promises_json    JSONB NOT NULL DEFAULT '[]',
      action_items_json JSONB NOT NULL DEFAULT '[]',
      meetings_json    JSONB NOT NULL DEFAULT '[]',
      sent_by_email    TEXT,
      received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function createHandoff(data: {
  hubspot_deal_id: string
  customer_name: string
  contract_type: string
  budget: number
  buffer_pct: number
  promises_json: unknown[]
  action_items_json: unknown[]
  meetings_json: unknown[]
  sent_by_email?: string | null
}): Promise<HandoffRow> {
  await ensureHandoffsTable()
  const result = await sql<HandoffRow>`
    INSERT INTO sales_handoffs (hubspot_deal_id, customer_name, contract_type, budget, buffer_pct, promises_json, action_items_json, meetings_json, sent_by_email)
    VALUES (
      ${data.hubspot_deal_id},
      ${data.customer_name},
      ${data.contract_type},
      ${data.budget},
      ${data.buffer_pct},
      ${JSON.stringify(data.promises_json)},
      ${JSON.stringify(data.action_items_json)},
      ${JSON.stringify(data.meetings_json)},
      ${data.sent_by_email ?? null}
    )
    ON CONFLICT (hubspot_deal_id) DO UPDATE SET
      customer_name     = EXCLUDED.customer_name,
      contract_type     = EXCLUDED.contract_type,
      budget            = EXCLUDED.budget,
      buffer_pct        = EXCLUDED.buffer_pct,
      promises_json     = EXCLUDED.promises_json,
      action_items_json = EXCLUDED.action_items_json,
      meetings_json     = EXCLUDED.meetings_json,
      sent_by_email     = EXCLUDED.sent_by_email,
      received_at       = NOW()
    RETURNING id, hubspot_deal_id, customer_name, contract_type, budget::float8 AS budget, buffer_pct::float8 AS buffer_pct, promises_json, action_items_json, meetings_json, sent_by_email, received_at::text AS received_at
  `
  return result.rows[0]
}

export async function listHandoffs(): Promise<HandoffRow[]> {
  await ensureHandoffsTable()
  const result = await sql<HandoffRow>`
    SELECT id, hubspot_deal_id, customer_name, contract_type, budget::float8 AS budget, buffer_pct::float8 AS buffer_pct, promises_json, action_items_json, meetings_json, sent_by_email, received_at::text AS received_at
    FROM sales_handoffs
    ORDER BY received_at DESC
    LIMIT 200
  `
  return result.rows
}
