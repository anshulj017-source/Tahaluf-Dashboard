import React, { useState } from 'react';

const labels = {
  'missing-column': 'Missing column',
  blank: 'Blank value',
  'non-standard': 'Non-standard value'
};

export default function DimensionFindings({
  findings = [],
  standards = {},
  customValues = {},
  eventCustomValues = {},
  eventId = null,
  eventName = null,
  onAcceptValue = null
}) {
  const [acceptingKey, setAcceptingKey] = useState(null);

  if (!findings.length) return null;
  const grouped = new Map();
  for (const finding of findings) {
    const group = grouped.get(finding.dimension) || { label: finding.label, findings: [] };
    group.findings.push(finding);
    grouped.set(finding.dimension, group);
  }

  const handleAccept = async (dimension, value, targetEventId, scope) => {
    if (!onAcceptValue) return;
    const key = `${dimension}:${value}:${scope}`;
    setAcceptingKey(key);
    try {
      await onAcceptValue(dimension, value, targetEventId, scope);
    } finally {
      setAcceptingKey(null);
    }
  };

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
              {finding.values.length > 0 && <div className="mt-2 flex flex-col gap-2">
                {finding.values.map(value => {
                  const targetId = finding.eventId || eventId;
                  const isEventAccepting = acceptingKey === `${id}:${value}:event`;
                  const isGlobalAccepting = acceptingKey === `${id}:${value}:global`;
                  return (
                    <div key={value} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white/10 p-2">
                      <code className="max-w-full break-all font-mono text-xs text-white">{value}</code>
                      {onAcceptValue && finding.type === 'non-standard' && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          {targetId && (
                            <button
                              type="button"
                              disabled={Boolean(acceptingKey)}
                              onClick={() => handleAccept(id, value, targetId, 'event')}
                              className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                              title={`Accept "${value}" for ${eventName || targetId}`}
                            >
                              {isEventAccepting ? 'Accepting…' : `+ Accept for ${eventName || targetId}`}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={Boolean(acceptingKey)}
                            onClick={() => handleAccept(id, value, null, 'global')}
                            className="rounded border border-[#14a6d9]/40 bg-[#14a6d9]/10 px-2 py-1 font-medium text-[#6bd5f7] hover:bg-[#14a6d9]/20 disabled:opacity-50"
                            title={`Accept "${value}" across all events globally`}
                          >
                            {isGlobalAccepting ? 'Accepting…' : '+ Accept globally'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
              <details className="mt-3 text-xs text-slate-300">
                <summary className="cursor-pointer rounded py-1 font-semibold text-[#6bd5f7]">View sample records</summary>
                <p className="mt-2 leading-relaxed">CSV records: {finding.sampleRows.join(', ')} (header included; not necessarily original sheet row numbers).</p>
                {finding.eventName && <p className="mt-1 break-words">Event value: {finding.eventName}</p>}
                {finding.sheetWide && <p className="mt-1 text-amber-200">Unmatched event in a shared sheet; shown for source investigation.</p>}
              </details>
            </li>)}
          </ul>
          {(standards[id]?.length > 0 || customValues[id]?.length > 0 || (eventId && eventCustomValues[eventId]?.[id]?.length > 0)) && <details className="mt-3 text-xs text-slate-300">
            <summary className="cursor-pointer rounded py-1 font-semibold text-[#6bd5f7]">View allowed values</summary>
            {standards[id]?.length > 0 && <p className="mt-2 break-words leading-relaxed text-slate-300"><strong className="text-white">Sheet standards ({standards[id].length}):</strong> {standards[id].join(', ')}</p>}
            {customValues[id]?.length > 0 && <p className="mt-1.5 break-words leading-relaxed text-[#6bd5f7]"><strong className="text-white">Global custom additions ({customValues[id].length}):</strong> {customValues[id].join(', ')}</p>}
            {eventId && eventCustomValues[eventId]?.[id]?.length > 0 && <p className="mt-1.5 break-words leading-relaxed text-amber-200"><strong className="text-white">Event custom additions ({eventCustomValues[eventId][id].length}):</strong> {eventCustomValues[eventId][id].join(', ')}</p>}
          </details>}
        </section>)}
      </div>
    </div>
  );
}
