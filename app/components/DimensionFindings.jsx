import React, { useState } from 'react';

const labels = {
  'missing-column': 'Missing column',
  blank: 'Blank value',
  'non-standard': 'Non-standard value'
};

function isEventBlankIgnored(dimensionId, targetId, eventName, ignoreMap = {}) {
  if (!ignoreMap || typeof ignoreMap !== 'object') return false;
  const candidates = [targetId, eventName].filter(Boolean).map(s => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const [key, dimMap] of Object.entries(ignoreMap)) {
    if (!dimMap || !dimMap[dimensionId]) continue;
    const cleanKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (candidates.some(c => c === cleanKey || (c.endsWith('26') && cleanKey.endsWith('26') && c.replace(/26$/, '') === cleanKey.replace(/26$/, '')))) {
      return true;
    }
  }
  return false;
}

function stringSimilarity(s1, s2) {
  const a = String(s1 || '').trim().toLowerCase();
  const b = String(s2 || '').trim().toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(a.length, b.length);
  return 1 - matrix[a.length][b.length] / maxLen;
}

function findBestSuggestion(value, candidateLists = []) {
  if (!value) return null;
  const allCandidates = candidateLists.flat().filter(Boolean);
  let best = null;
  let maxSim = 0;
  for (const cand of allCandidates) {
    if (cand.toLowerCase() === value.toLowerCase()) continue;
    const sim = stringSimilarity(value, cand);
    if (sim > maxSim && sim >= 0.6) {
      maxSim = sim;
      best = cand;
    }
  }
  return best ? { suggestion: best, score: Math.round(maxSim * 100) } : null;
}

export default function DimensionFindings({
  findings = [],
  standards = {},
  customValues = {},
  eventCustomValues = {},
  ignoreBlanksByDimension = {},
  ignoreBlanksByEventDimension = {},
  eventId = null,
  eventName = null,
  onAcceptValue = null,
  onIgnoreBlanks = null
}) {
  const [acceptingKey, setAcceptingKey] = useState(null);
  const [ignoringKey, setIgnoringKey] = useState(null);

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

  const handleIgnoreBlanks = async (dimension, targetEventId, scope) => {
    if (!onIgnoreBlanks) return;
    const key = `${dimension}:${targetEventId || 'global'}:${scope}`;
    setIgnoringKey(key);
    try {
      await onIgnoreBlanks(dimension, targetEventId, scope);
    } finally {
      setIgnoringKey(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-amber-100">{grouped.size} dimension{grouped.size === 1 ? '' : 's'} need attention. Counts are per check; the same record may have multiple issues.</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {[...grouped].map(([id, group]) => <section key={id} aria-label={`${group.label} findings`} className="min-w-0 rounded-xl border border-amber-300/25 bg-[#071d33] p-4">
          <h5 className="text-sm font-bold text-white">{group.label}</h5>
          <ul className="mt-3 space-y-3">
            {group.findings.map((finding, index) => {
              const targetId = finding.eventId || eventId;
              const isBlanksIgnoredGlobal = Boolean(ignoreBlanksByDimension[id]);
              const isBlanksIgnoredEvent = isEventBlankIgnored(id, targetId, eventName, ignoreBlanksByEventDimension);
              const isBlankType = finding.type === 'blank';

              return (
                <li key={`${finding.type}:${index}`} className="rounded-lg border border-white/10 bg-[#031120]/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-amber-200">{labels[finding.type] || finding.type}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-300/10 px-2 py-1 font-bold tabular-nums text-amber-100">{finding.count.toLocaleString()} record{finding.count === 1 ? '' : 's'}</span>
                      {onIgnoreBlanks && isBlankType && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          {isBlanksIgnoredGlobal ? (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-500/20 border border-slate-400/40 px-2 py-0.5 font-semibold text-slate-300">
                              ✓ Blanks ignored globally
                            </span>
                          ) : isBlanksIgnoredEvent ? (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-500/20 border border-slate-400/40 px-2 py-0.5 font-semibold text-slate-300">
                              ✓ Blanks ignored for {eventName || targetId}
                            </span>
                          ) : (
                            <>
                              {targetId && (
                                <button
                                  type="button"
                                  disabled={Boolean(ignoringKey)}
                                  onClick={() => handleIgnoreBlanks(id, targetId, 'event')}
                                  className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                                  title={`Ignore blank values for ${group.label} in ${eventName || targetId}`}
                                >
                                  {ignoringKey === `${id}:${targetId}:event` ? 'Ignoring…' : `Ignore blanks (${eventName || targetId})`}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={Boolean(ignoringKey)}
                                onClick={() => handleIgnoreBlanks(id, null, 'global')}
                                className="rounded border border-[#14a6d9]/40 bg-[#14a6d9]/10 px-2 py-0.5 font-medium text-[#6bd5f7] hover:bg-[#14a6d9]/20 disabled:opacity-50"
                                title={`Ignore blank values for ${group.label} globally across all events`}
                              >
                                {ignoringKey === `${id}:global:global` ? 'Ignoring…' : 'Ignore blanks globally'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {finding.values.length > 0 && <div className="mt-2 flex flex-col gap-2">
                    {finding.values.map(value => {
                      const targetId = finding.eventId || eventId;
                      const isEventAccepting = acceptingKey === `${id}:${value}:event`;
                      const isGlobalAccepting = acceptingKey === `${id}:${value}:global`;
                      const normVal = String(value || '').trim().toLowerCase();
                      const isAcceptedGlobally = (customValues[id] || []).some(v => String(v || '').trim().toLowerCase() === normVal);
                      const isAcceptedEvent = Boolean(targetId && (eventCustomValues[targetId]?.[id] || []).some(v => String(v || '').trim().toLowerCase() === normVal));
                      const isAccepted = isAcceptedGlobally || isAcceptedEvent;
                      const bestSuggestion = finding.type === 'non-standard' && !isAccepted
                        ? findBestSuggestion(value, [standards[id] || [], customValues[id] || [], eventCustomValues[targetId]?.[id] || []])
                        : null;

                      return (
                        <div key={value} className="flex flex-col gap-1.5 rounded bg-white/10 p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <code className="max-w-full break-all font-mono text-xs text-white">{value}</code>
                            {onAcceptValue && finding.type === 'non-standard' && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                {isAcceptedGlobally ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 font-semibold text-emerald-300">
                                    ✓ Accepted globally
                                  </span>
                                ) : isAcceptedEvent ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 font-semibold text-emerald-300">
                                    ✓ Accepted for {eventName || targetId}
                                  </span>
                                ) : (
                                  <>
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
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {bestSuggestion && (
                            <div className="flex items-center gap-1.5 text-[11px] text-lime-300/90 bg-lime-950/40 border border-lime-500/20 rounded px-2 py-0.5">
                              <span>💡 Did you mean standard:</span>
                              <span className="font-semibold text-lime-200 underline underline-offset-2">{bestSuggestion.suggestion}</span>
                              <span className="text-[10px] text-lime-400/60">({bestSuggestion.score}% match)</span>
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
                </li>
              );
            })}
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
