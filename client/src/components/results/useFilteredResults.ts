import { useMemo } from 'react'
import type { JobResult } from '../../lib/types'
import { useEngine } from '../../state/engine'
import { useUi, type ResultFilter } from '../../state/ui'

export function filterResults(results: JobResult[], filter: ResultFilter, query: string): JobResult[] {
  const q = query.trim().toLowerCase()
  return results.filter((r) => {
    if (filter === 'developed' && r.outcome !== 'Succeeded') return false
    if (filter === 'failed' && r.outcome === 'Succeeded') return false
    return !q || r.relativePath.toLowerCase().includes(q)
  })
}

/** Finished jobs after the panel's filter and search, shared by the contact sheet, ledger and viewer. */
export function useFilteredResults() {
  const results = useEngine((s) => s.results)
  const filter = useUi((s) => s.resultFilter)
  const query = useUi((s) => s.resultQuery)
  return useMemo(() => filterResults(results, filter, query), [results, filter, query])
}
