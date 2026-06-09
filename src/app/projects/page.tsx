import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listHandoffs } from '@/lib/db/handoffs'
import type { Metadata } from 'next'
import { Folder } from 'lucide-react'

export const metadata: Metadata = { title: 'Projects — Mission Control' }
export const dynamic = 'force-dynamic'

const CONTRACT_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  fixed:  { bg: '#DCFCE7', color: '#15803D' },
  'T&M':  { bg: '#DBEAFE', color: '#1D4ED8' },
  hybrid: { bg: '#FEF3C7', color: '#B45309' },
  phased: { bg: '#EDE9FE', color: '#6D28D9' },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatBudget(budget: number): string {
  if (budget >= 1_000_000) return `${(budget / 1_000_000).toFixed(1)} MNOK`
  if (budget >= 1_000) return `${(budget / 1_000).toFixed(0)}k NOK`
  return `${budget} NOK`
}

export default async function ProjectsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/auth')

  let handoffs: Awaited<ReturnType<typeof listHandoffs>> = []
  let dbError: string | null = null

  try {
    handoffs = await listHandoffs()
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Failed to load projects'
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-5xl space-y-6">
      <section className="space-y-2">
        <p className="text-xs font-medium" style={{ color: 'var(--page-text)', opacity: 0.5 }}>Delivery</p>
        <div className="flex items-center gap-3">
          <Folder size={22} style={{ color: 'var(--accent)' }} />
          <h1 className="text-3xl font-semibold" style={{ color: 'var(--page-text)' }}>Projects</h1>
          <span
            className="text-xs rounded-full px-2 py-0.5"
            style={{ background: 'var(--page-surface)', border: '1px solid var(--page-border)', color: 'var(--page-text)', opacity: 0.6 }}
          >
            {handoffs.length}
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--page-text)', opacity: 0.6 }}>
          Deals handed off from Sales — contract details and promises visible to the delivery team.
        </p>
      </section>

      {dbError && (
        <div className="rounded-lg p-4" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <p className="text-sm font-medium text-red-700">Could not load projects: {dbError}</p>
        </div>
      )}

      {!dbError && handoffs.length === 0 && (
        <div
          className="rounded-lg p-12 text-center"
          style={{ background: 'var(--page-surface)', border: '1px solid var(--page-border)' }}
        >
          <Folder size={32} className="mx-auto mb-3" style={{ color: 'var(--page-text)', opacity: 0.3 }} />
          <p className="text-sm" style={{ color: 'var(--page-text)', opacity: 0.5 }}>
            No projects handed off yet.
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--page-text)', opacity: 0.35 }}>
            When a deal closes in Sales Cockpit and is sent here, it will appear above.
          </p>
        </div>
      )}

      {!dbError && handoffs.length > 0 && (
        <div className="space-y-3">
          {handoffs.map((h) => {
            const ctStyle = CONTRACT_TYPE_STYLES[h.contract_type] ?? { bg: '#F3F4F6', color: '#6B7280' }
            const promiseCount = Array.isArray(h.promises_json) ? h.promises_json.length : 0
            return (
              <div
                key={h.id}
                className="rounded-lg p-4"
                style={{ background: 'var(--page-surface)', border: '1px solid var(--page-border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-base truncate" style={{ color: 'var(--page-text)' }}>
                      {h.customer_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--page-text)', opacity: 0.5 }}>
                      Received {formatDate(h.received_at)}
                      {h.sent_by_email && ` · by ${h.sent_by_email}`}
                    </p>
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0"
                    style={{ background: ctStyle.bg, color: ctStyle.color }}
                  >
                    {h.contract_type}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                  <span style={{ color: 'var(--page-text)', opacity: 0.7 }}>
                    Budget: <strong style={{ color: 'var(--page-text)' }}>{formatBudget(h.budget)}</strong>
                  </span>
                  <span style={{ color: 'var(--page-text)', opacity: 0.7 }}>
                    Buffer: <strong style={{ color: 'var(--page-text)' }}>{h.buffer_pct}%</strong>
                  </span>
                  {promiseCount > 0 && (
                    <span style={{ color: 'var(--page-text)', opacity: 0.7 }}>
                      Promises: <strong style={{ color: 'var(--page-text)' }}>{promiseCount}</strong>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
