import React from 'react';

const labels = {
  'missing-column': 'Missing column',
  blank: 'Blank value',
  'non-standard': 'Non-standard value'
};

export default function DimensionFindings({ findings = [], standards = {} }) {
  if (!findings.length) return null;
  const grouped = new Map();
  for (const finding of findings) {
    const group = grouped.get(finding.dimension) || { label: finding.label, findings: [] };
    group.findings.push(finding);
    grouped.set(finding.dimension, group);
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-amber-100">{grouped.size} dimension{grouped.size === 1 ? '' : 's'} need attention. Counts are per check; the same record may have multiple issues.</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {[...grouped].map(([id, group]) => <section key={id} aria-label={`${group.label} findings`} className="min-w-0 rounded-xl border border-amber-300/25 bg-[#071d33] p-4">
          <h5 className="text-sm font-bold text-white">{group.label}</h5>
          <ul className="mt-3 space-y-3">
            {group.findings.map((finding, index) => <li key={`${finding.type}:${index}`} className="rounded-lg border border-white/10 bg-[#031120]/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-amber-200">{labels[finding.type] || finding.type}</span>
                <span className="rounded-full bg-amber-300/10 px-2 py-1 font-bold tabular-nums text-amber-100">{finding.count.toLocaleString()} record{finding.count === 1 ? '' : 's'}</span>
              </div>
              {finding.values.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
                {finding.values.map(value => <code key={value} className="max-w-full break-all rounded bg-white/10 px-2 py-1 text-xs text-white">{value}</code>)}
              </div>}
              <details className="mt-3 text-xs text-slate-300">
                <summary className="cursor-pointer rounded py-1 font-semibold text-[#6bd5f7]">View sample records</summary>
                <p className="mt-2 leading-relaxed">CSV records: {finding.sampleRows.join(', ')} (header included; not necessarily original sheet row numbers).</p>
                {finding.eventName && <p className="mt-1 break-words">Event value: {finding.eventName}</p>}
                {finding.sheetWide && <p className="mt-1 text-amber-200">Unmatched event in a shared sheet; shown for source investigation.</p>}
              </details>
            </li>)}
          </ul>
          {standards[id]?.length > 0 && <details className="mt-3 text-xs text-slate-300">
            <summary className="cursor-pointer rounded py-1 font-semibold text-[#6bd5f7]">View allowed values</summary>
            <p className="mt-2 break-words leading-relaxed">{standards[id].join(', ')}</p>
          </details>}
        </section>)}
      </div>
    </div>
  );
}
