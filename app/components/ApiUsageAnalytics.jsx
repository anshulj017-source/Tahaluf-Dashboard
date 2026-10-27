"use client";

import React, { useEffect, useState } from 'react';
import { auth } from '../../lib/firebase';

const number = value => value == null ? 'Not available' : Math.round(value).toLocaleString();
const money = value => value == null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);
const fields = [
  ['ratePerThousand', 'USD / 1,000 observed units'],
  ['monthlyAllowance', 'Monthly included units / allowance'],
  ['baseMonthlyCost', 'Base monthly USD'],
  ['monthlyBudget', 'Monthly budget USD']
];

export default function ApiUsageAnalytics({ report, onSaved, onPolicySaved }) {
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [selectedServices, setSelectedServices] = useState([]);
  const [savingServices, setSavingServices] = useState(false);
  useEffect(() => {
    if (report) setSelectedServices(report.monitoredServices || report.services.map(service => service.id));
  }, [report]);
  useEffect(() => {
    if (report && !editing) setDraft(Object.fromEntries((report.availableServices || report.services).map(service => [service.id, service.settings])));
  }, [report, editing]);

  const saveServices = async () => {
    setSavingServices(true);
    setError('');
    setNotice('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'save-monitored-services', services: selectedServices })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save monitored APIs.');
      await onSaved();
      setNotice('Monitored APIs saved. Other server instances may take up to 60 seconds to update.');
    } catch (error) {
      setError(error.message);
    } finally {
      setSavingServices(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'save-budgets', services: draft })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save API budgets.');
      setEditing(false);
      setNotice('Budget settings saved.');
      await onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    setSavingPolicy(true);
    setError('');
    setNotice('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'save-policy', lowQuotaMode: !report.policy?.lowQuotaMode })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save low-quota mode.');
      await onPolicySaved?.(json.policy);
      setNotice(`Low-quota mode ${json.policy.lowQuotaMode ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      setError(error.message);
    } finally {
      setSavingPolicy(false);
    }
  };

  if (!report) return null;
  return (
    <section className="space-y-4 rounded-2xl border border-[#14a6d9]/30 p-5 bg-[#031120]/70">
      <div className="flex justify-between gap-3 flex-wrap items-center">
        <h3 className="font-bold text-white">API Analytics, Spend &amp; Usage Forecast</h3>
        <button onClick={() => { setEditing(!editing); setNotice(''); }} disabled={saving} className="px-3 py-2 border border-[#14a6d9]/40 rounded-lg text-xs text-[#14a6d9]">{editing ? 'Cancel budget changes' : 'Configure rates & budgets'}</button>
      </div>
      <p className="text-xs text-gray-400">Observed application traffic, not provider-wide billing. Monitoring began {report.startedAt ? new Date(report.startedAt).toLocaleString() : 'with the first measured request'}. Provider actual spend and hard quotas are not connected. Local requests do not count as Vercel usage.</p>
      <p className="text-xs text-gray-400">{report.forecastMethod} Available completed days: {report.forecastSampleDays}. Estimates use your rates, not automatic vendor pricing. Firestore combined operations are not a substitute for vendor read/write pricing.</p>
      <p className="text-xs text-amber-200">{report.firestoreDaily?.resetNotice}</p>
      <p className="text-xs text-gray-400">{report.collectionNotice}</p>
      <fieldset disabled={savingServices} className="rounded-xl border border-white/10 p-3 space-y-3">
        <legend className="text-sm font-bold px-1">APIs used by Tahaluf</legend>
        <p className="text-xs text-gray-400">Only selected APIs appear in monitoring and receive usage tracking or health probes. This does not disable integrations, authentication, sheet recovery, or analytics itself. Existing history and budgets are retained. Monitoring still needs Firebase for settings and usage storage; reductions depend on which APIs you deselect. Untracked periods leave gaps in totals and forecasts, not proof of zero provider usage.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {(report.availableServices || report.services).map(service => <label key={service.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={event => setSelectedServices(current => event.target.checked ? [...current, service.id] : current.filter(id => id !== service.id))} />
            {service.name}
          </label>)}
        </div>
        <button type="button" onClick={saveServices} className="px-3 py-2 border border-[#14a6d9]/40 rounded-lg text-xs text-[#14a6d9]">{savingServices ? 'Saving APIs...' : 'Save monitored APIs'}</button>
      </fieldset>
      <div className="rounded-xl border border-white/10 p-3 space-y-2">
        <button type="button" role="switch" aria-checked={report.policy?.lowQuotaMode === true} onClick={savePolicy} disabled={savingPolicy} className="px-3 py-2 border border-[#14a6d9]/40 rounded-lg text-xs text-[#14a6d9] disabled:opacity-40">
          {savingPolicy ? 'Saving mode...' : `Low-quota mode: ${report.policy?.lowQuotaMode ? 'On' : 'Off'}`}
        </button>
        <p className="text-xs text-gray-400">Optional, persistent policy. Pauses automatic admin analytics, health and quota refreshes; manual refresh remains available. Other controls pick up changes on the next visible-page policy check (60 seconds), plus up to 60 seconds of instance caching. Essential dashboard data, authentication and configuration remain enabled. No sampling or dropping important events.</p>
      </div>
      {report.failedSamples > 0 && <p role="alert" className="text-amber-300 text-xs">Telemetry is incomplete: {report.failedSamples} sample writes failed on this instance. {report.lastError}</p>}
      {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
      {notice && <p role="status" className="text-lime-300 text-sm">{notice}</p>}
      <div className="grid md:grid-cols-2 gap-4">
        {report.services.length === 0 && <p className="text-sm text-gray-400">API monitoring is disabled. Select APIs above to resume. Previously recorded history is retained.</p>}
        {report.services.map(service => {
          const max = Math.max(1, ...service.history.map(point => point.count || 0));
          return (
            <article key={service.id} className="border border-white/10 rounded-xl p-4 space-y-3">
              <h4 className="font-bold text-sm">{service.name}</h4>
              <p className="text-[11px] text-gray-400">{service.coverage}</p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Observed today', number(service.todayUsage)],
                  ['Observed this month', number(service.monthUsage)],
                  ['Mean / completed day', number(service.averageDailyUsage)],
                  ['Forecast month-end units', number(service.projectedUsage)],
                  ['Actual provider spend', 'Not connected'],
                  ['Estimated current spend', money(service.estimatedSpend)],
                  ['Forecast month-end spend', money(service.projectedSpend)],
                  ['Monthly budget', money(service.settings.monthlyBudget)],
                  ['Configured allowance used', service.quotaPercent == null ? 'Not configured' : `${service.quotaPercent.toFixed(1)}%`],
                  ['Estimated budget used', service.budgetPercent == null ? 'Not configured' : `${service.budgetPercent.toFixed(1)}%`]
                ].map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="text-white mt-1">{value}</dd></div>)}
              </dl>
              {service.id === 'firestore' && <p className="text-xs text-gray-400">Month-to-date: {number(service.metrics.reads || 0)} reads, {number(service.metrics.writes || 0)} writes, {number(service.metrics.deletes || 0)} deletes observed.</p>}
              {service.id === 'firestore' && report.firestoreDaily && <div className="space-y-3">
                <h5 className="font-bold text-xs">Daily observed Firestore operations — UTC, partial coverage</h5>
                <p className="text-[11px] text-gray-400">{report.firestoreDaily.forecastMethod}</p>
                {report.firestoreDaily.metrics.map(metric => {
                  const peak = Math.max(1, ...report.firestoreDaily.history.map(day => day[metric.metric] || 0));
                  return <div key={metric.metric} className="space-y-1">
                    <p className="text-xs">{metric.metric}: {number(metric.today)} today · forecast {number(metric.projectedToday)} · completed-day mean {number(metric.averageDaily)}</p>
                    <p className="text-[10px] text-gray-400">Reference only: {number(metric.referenceDailyLimit)} / day; {metric.percent == null ? 'no observations yet' : `${metric.percent.toFixed(1)}% observed`}, {metric.forecastPercent == null ? 'no forecast yet' : `${metric.forecastPercent.toFixed(1)}% forecast`}. Not verified remaining quota.</p>
                    {metric.warning && <p role="alert" className="text-xs text-amber-300">{metric.warning === 'critical' ? '90%' : '70%'} reference warning: observed usage or UTC-day pace is approaching/exceeding the reference threshold. Verify actual usage in the provider console.</p>}
                    <div aria-label={`Firestore ${metric.metric} 14-day UTC history`} className="flex gap-1 items-end h-10">
                      {report.firestoreDaily.history.map(day => <div key={day.date} title={`${day.date} UTC: ${number(day[metric.metric])} ${metric.metric}`} className={`flex-1 rounded-t ${day[metric.metric] == null ? 'bg-gray-700' : 'bg-[#14a6d9]'}`} style={{ height: day[metric.metric] == null ? '2px' : `${Math.max(3, day[metric.metric] / peak * 100)}%` }} />)}
                    </div>
                  </div>;
                })}
              </div>}
              {service.quotaPercent >= 70 && <p role="alert" className="text-amber-300 text-xs">Observed usage has reached {service.quotaPercent.toFixed(1)}% of your configured monthly allowance (not a verified provider quota).</p>}
              {service.projectedUsage > service.settings.monthlyAllowance && service.settings.monthlyAllowance > 0 && <p className="text-amber-300 text-xs">Month-end usage forecast exceeds your configured allowance.</p>}
              {service.forecastOverBudget && <p className="text-amber-300 text-xs">Forecast exceeds the configured monthly budget.</p>}
              <div aria-label={`${service.name} 14-day usage history`} className="flex gap-1 items-end h-14">
                {service.history.map(point => <div key={point.date} title={`${point.date}: ${number(point.count)} ${service.unit}`} className={`flex-1 rounded-t ${point.count == null ? 'bg-gray-700' : 'bg-[#14a6d9]'}`} style={{ height: point.count == null ? '2px' : `${Math.max(3, (point.count / max) * 100)}%` }} />)}
              </div>
              <p className="text-[10px] text-gray-500">Last 14 UTC days; hover for daily counts. Gray = no observation coverage.</p>
              {editing && <div className="grid grid-cols-2 gap-2">
                {fields.map(([key, label]) => <label key={key} className="text-[10px] text-gray-400">{label}
                  <input aria-label={`${service.name} ${label}`} type="number" min="0" step="any" value={draft[service.id]?.[key] ?? ''} placeholder="Not configured" onChange={event => setDraft(current => ({ ...current, [service.id]: { ...current[service.id], [key]: event.target.value === '' ? null : Number(event.target.value) } }))} className="w-full bg-[#041628] rounded-lg border border-gray-600 mt-1 p-2 text-xs text-white" />
                </label>)}
              </div>}
            </article>
          );
        })}
      </div>
      {editing && <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-[#cedc28] text-[#041628] font-bold text-sm disabled:opacity-40">{saving ? 'Saving...' : 'Save rates & budgets'}</button>}
    </section>
  );
}
