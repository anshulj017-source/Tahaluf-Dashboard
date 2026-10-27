"use client";

import React, { useEffect, useState } from 'react';
import { auth } from '../../lib/firebase';
import { useAdminDirtyGuard } from './AdminUI';

const number = value => value == null ? 'Not available' : Math.round(value).toLocaleString();
const money = value => value == null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);
const fields = [
  ['ratePerThousand', 'USD / 1,000 observed units'],
  ['monthlyAllowance', 'Monthly included units / allowance'],
  ['baseMonthlyCost', 'Base monthly USD'],
  ['monthlyBudget', 'Monthly budget USD']
];
const dailyFields = [
  ['dailyReadLimit', 'Daily read reference limit'],
  ['dailyWriteLimit', 'Daily write reference limit'],
  ['dailyDeleteLimit', 'Daily delete reference limit']
];

export default function ApiUsageAnalytics({ report, onSaved, onPolicySaved, view = 'overview' }) {
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [selectedServices, setSelectedServices] = useState([]);
  const [savingServices, setSavingServices] = useState(false);
  const [alertThresholds, setAlertThresholds] = useState({});
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [servicesDirty, setServicesDirty] = useState(false);
  const [alertsDirty, setAlertsDirty] = useState(false);
  useAdminDirtyGuard('api-settings', editing || servicesDirty || alertsDirty);
  useEffect(() => {
    if (report && !alertsDirty) setAlertThresholds(report.alertThresholds || {});
  }, [report, alertsDirty]);
  useEffect(() => {
    if (report && !servicesDirty) setSelectedServices(report.monitoredServices || report.services.map(service => service.id));
  }, [report, servicesDirty]);
  useEffect(() => {
    if (report && !editing) setDraft(Object.fromEntries((report.availableServices || report.services).map(service => [service.id, service.settings])));
  }, [report, editing]);
  const refreshAfterSave = async () => {
    try {
      await onSaved();
    } catch (error) {
      throw new Error(`Settings were saved, but the report could not refresh: ${error.message}. Your draft has been retained; refresh before saving again.`);
    }
  };

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
      await refreshAfterSave();
      setServicesDirty(false);
      setNotice('Monitored APIs saved. Other server instances may take up to 60 seconds to update.');
    } catch (error) {
      setError(error.message);
    } finally {
      setSavingServices(false);
    }
  };

  const saveAlerts = async () => {
    setSavingAlerts(true);
    setError('');
    setNotice('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'save-alert-thresholds', alertThresholds })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save API alert selections.');
      await refreshAfterSave();
      setAlertsDirty(false);
      setNotice('API alert selections saved. Other server instances may take up to 60 seconds to update.');
    } catch (error) {
      setError(error.message);
    } finally {
      setSavingAlerts(false);
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
      await refreshAfterSave();
      setEditing(false);
      setNotice('Budget settings saved.');
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
    <section className="space-y-4">
      {report.failedSamples > 0 && <p role="alert" className="text-amber-300 text-sm">Telemetry is incomplete: {report.failedSamples} sample writes failed on this instance. {report.lastError}</p>}
      {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
      {notice && <p role="status" className="text-lime-300 text-sm">{notice}</p>}
      {(editing || servicesDirty || alertsDirty) && <div role="status" className="rounded-lg border border-amber-400/40 p-3 text-sm text-amber-200">
        Unsaved API settings. Refreshes will not replace your draft.
        <button type="button" disabled={saving || savingServices || savingAlerts} onClick={() => { setEditing(false); setServicesDirty(false); setAlertsDirty(false); setNotice('Draft changes discarded.'); }} className="ml-3 underline">Discard changes</button>
      </div>}
      <div hidden={view !== 'alerts'}>
      <div className="flex justify-between gap-3 flex-wrap items-center">
        <h3 className="font-bold text-white">Alerts, limits &amp; monitoring settings</h3>
        <button onClick={() => { setEditing(!editing); setNotice(''); }} disabled={saving} className="px-3 py-2 border border-[#14a6d9]/40 rounded-lg text-xs text-[#14a6d9]">{editing ? 'Cancel budget changes' : 'Configure rates & budgets'}</button>
      </div>
      </div>
      <details className="rounded-lg border border-white/10 p-3 text-sm text-slate-300">
        <summary className="cursor-pointer font-semibold">Coverage, forecast method &amp; reference limits</summary>
      <p className="mt-3">Observed application traffic, not provider-wide billing. Monitoring began {report.startedAt ? new Date(report.startedAt).toLocaleString() : 'with the first measured request'}. Provider actual spend and hard quotas are not connected. Local requests do not count as Vercel usage.</p>
      <p className="text-xs text-gray-400">{report.forecastMethod} Available completed days: {report.forecastSampleDays}. Estimates use your rates, not automatic vendor pricing. Firestore combined operations are not a substitute for vendor read/write pricing.</p>
      <p className="text-xs text-amber-200">{report.firestoreDaily?.resetNotice}</p>
      <p className="text-xs text-gray-400">{report.collectionNotice}</p>
      <p className="text-xs text-gray-400">Free-tier references are assumed, not verified account limits: Vercel Hobby monthly invocations and Firestore daily operations. Change them with Configure rates &amp; budgets. Saved values take precedence; clearing a reference restores its free-tier default, and 0 disables that reference. Other allowances stay unconfigured when no matching provider limit exists.</p>
      </details>
      <div hidden={view !== 'alerts'} className="space-y-4">
      <fieldset disabled={savingServices} className="rounded-xl border border-white/10 p-3 space-y-3">
        <legend className="text-sm font-bold px-1">APIs used by Tahaluf</legend>
        <p className="text-xs text-gray-400">Only selected APIs appear in monitoring and receive usage tracking or health probes. This does not disable integrations, authentication, sheet recovery, or analytics itself. Existing history and budgets are retained. Monitoring still needs Firebase for settings and usage storage; reductions depend on which APIs you deselect. Untracked periods leave gaps in totals and forecasts, not proof of zero provider usage.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {(report.availableServices || report.services).map(service => <label key={service.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={event => { setServicesDirty(true); setSelectedServices(current => event.target.checked ? [...current, service.id] : current.filter(id => id !== service.id)); }} />
            {service.name}
          </label>)}
        </div>
        <button type="button" disabled={!servicesDirty} onClick={saveServices} className="px-3 py-2 border border-[#14a6d9]/40 rounded-lg text-xs text-[#14a6d9] disabled:opacity-40">{savingServices ? 'Saving APIs...' : 'Save monitored APIs'}</button>
      </fieldset>
      <fieldset disabled={savingAlerts} className="rounded-xl border border-white/10 p-3 space-y-3">
        <legend className="text-sm font-bold px-1">API threshold warnings &amp; email</legend>
        <p className="text-xs text-gray-400">Both markers are enabled by default for every API. Selections control dashboard warnings and emails to the Health Monitor notification recipients, respecting its email-enabled switch. Only monitored APIs are evaluated. Configure an allowance or spend budget for percentage alerts; Firestore also has daily reference markers.</p>
        <div className="space-y-3">
          {(report.availableServices || report.services).map(service => <div key={service.id} className="flex flex-wrap gap-3 items-center text-xs">
            <span className="sm:w-64">{service.name}</span>
            {[70, 90].map(threshold => <label key={threshold} className="flex gap-2 items-center">
              <input type="checkbox" aria-label={`${service.name} ${threshold}% alerts`} checked={alertThresholds[service.id]?.[threshold] !== false}
                onChange={event => { setAlertsDirty(true); setAlertThresholds(current => ({ ...current, [service.id]: { ...current[service.id], [threshold]: event.target.checked } })); }} />
              {threshold}%
            </label>)}
            <span className="text-gray-500">{!report.monitoredServices?.includes(service.id) ? 'Monitoring disabled' : service.id === 'ga4' ? 'Not connected' : !(service.settings.monthlyAllowance > 0 || service.settings.monthlyBudget > 0 || (service.id === 'firestore' && dailyFields.some(([key]) => service.settings[key] > 0))) ? 'Limit not configured' : 'Reference / configured limits'}</span>
            <p className="w-full text-gray-400">{service.quotaNote}</p>
          </div>)}
        </div>
        <button type="button" disabled={!alertsDirty} onClick={saveAlerts} className="px-3 py-2 border border-[#14a6d9]/40 rounded-lg text-xs text-[#14a6d9] disabled:opacity-40">{savingAlerts ? 'Saving alerts...' : 'Save alert selections'}</button>
        <p className="text-xs text-gray-400">Checks run with recorded traffic and monitoring refreshes, not a scheduler. Email is deduplicated per API, metric, marker and UTC day/month; crossing both markers can produce one combined email. Failed deliveries retry on a subsequent check after five minutes. These are partial observations and forecasts, not verified provider quota. SMTP acceptance does not guarantee inbox delivery.</p>
        <p role="status" className="text-xs text-gray-400">Email check on this instance: {report.alertDelivery?.status || 'not-checked'}{report.alertDelivery?.lastCheckedAt ? ` (${new Date(report.alertDelivery.lastCheckedAt).toLocaleString()})` : ''}.</p>
        {report.alertDelivery?.lastError && <p role="alert" className="text-xs text-amber-300">Quota notification error: {report.alertDelivery.lastError}</p>}
      </fieldset>
      <div className="rounded-xl border border-white/10 p-3 space-y-2">
        <button type="button" role="switch" aria-checked={report.policy?.lowQuotaMode === true} onClick={savePolicy} disabled={savingPolicy} className="px-3 py-2 border border-[#14a6d9]/40 rounded-lg text-xs text-[#14a6d9] disabled:opacity-40">
          {savingPolicy ? 'Saving mode...' : `Low-quota mode: ${report.policy?.lowQuotaMode ? 'On' : 'Off'}`}
        </button>
        <p className="text-xs text-gray-400">Optional, persistent policy. Pauses automatic admin analytics and health refreshes; API reports load on entry or manual refresh only. Other controls pick up changes on the next visible-page policy check (60 seconds), plus up to 60 seconds of instance caching. Essential dashboard data, authentication and configuration remain enabled. No sampling or dropping important events.</p>
      </div>
      {editing && <div className="space-y-4">{(report.availableServices || report.services).map(service => <fieldset disabled={saving} key={service.id} className="rounded-lg border border-slate-600 p-3">
        <legend className="px-2 text-sm font-bold">{service.name}{!report.services.some(item => item.id === service.id) ? ' (monitoring disabled)' : ''}</legend>
        <div className="grid sm:grid-cols-2 gap-3">{[...fields, ...(service.id === 'firestore' ? dailyFields : [])].map(([key, label]) => <label key={key} className="text-sm text-slate-300">{label}
          <input aria-label={`${service.name} ${label}`} type="number" min="0" step="any" value={draft[service.id]?.[key] ?? ''} placeholder="Not configured" onChange={event => setDraft(current => ({ ...current, [service.id]: { ...current[service.id], [key]: event.target.value === '' ? null : Number(event.target.value) } }))} className="mt-1 w-full rounded border border-slate-600 bg-[#041628] p-2 text-white" />
        </label>)}</div>
      </fieldset>)}
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-[#cedc28] text-[#041628] font-bold text-sm disabled:opacity-40">{saving ? 'Saving...' : 'Save rates & budgets'}</button>
      </div>}
      </div>
      {view === 'overview' && <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-left text-slate-300">Monthly observed usage and estimates — not verified provider billing</caption>
          <thead><tr>{['Service', 'Observed units', 'Monthly reference', 'Used', 'Month-end forecast', 'Estimated spend', 'Forecast spend', 'Coverage'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{[...report.services].sort((a, b) => Math.max(b.quotaPercent || 0, b.budgetPercent || 0) - Math.max(a.quotaPercent || 0, a.budgetPercent || 0)).map(service => <tr key={service.id} className="border-t border-white/10">
            <th className="p-3">{service.name}</th><td className="p-3">{number(service.monthUsage)}</td><td className="p-3">{number(service.settings.monthlyAllowance)}</td>
            <td className="p-3">{service.quotaPercent == null ? 'Not configured' : `${service.quotaPercent.toFixed(1)}%`}</td>
            <td className="p-3">{number(service.projectedUsage)}</td><td className="p-3">{money(service.estimatedSpend)}</td><td className="p-3">{money(service.projectedSpend)}</td>
            <td className="p-3">{service.id === 'ga4' ? 'Not connected' : 'Partial observations'}
              {(report.alerts || []).filter(alert => alert.service === service.id).map(alert => <p role="alert" key={alert.key} className="mt-1 text-amber-200">{alert.message}</p>)}
            </td>
          </tr>)}</tbody>
        </table>
        {!report.services.length && <p className="p-3 text-sm text-slate-300">Monitoring disabled. Select APIs in Alerts &amp; Limits to resume.</p>}
        {report.firestoreDaily && report.services.some(service => service.id === 'firestore') && <div className="border-t border-white/10 p-3 text-sm text-slate-300">
          <h4 className="font-bold text-white">Firestore daily references — UTC, separate from monthly totals</h4>
          {report.firestoreDaily.metrics.map(metric => <p key={metric.metric} className="mt-2">{metric.metric}: {number(metric.today)} observed / {metric.referenceDailyLimit > 0 ? number(metric.referenceDailyLimit) : 'reference disabled'} · {metric.percent == null ? 'percentage unavailable' : `${metric.percent.toFixed(1)}%`} · forecast {number(metric.projectedToday)}</p>)}
        </div>}
      </div>}
      <div hidden={view !== 'usage'} className="grid md:grid-cols-2 gap-4">
        {report.services.length === 0 && <p className="text-sm text-gray-400">API monitoring is disabled. Select APIs above to resume. Previously recorded history is retained.</p>}
        {report.services.map(service => {
          const max = Math.max(1, ...service.history.map(point => point.count || 0));
          return (
            <article key={service.id} className="border border-white/10 rounded-xl p-4 space-y-3">
              <h4 className="font-bold text-sm">{service.name}</h4>
              <p className="text-[11px] text-gray-400">{service.coverage}</p>
              <p className="text-[11px] text-gray-400">{service.quotaNote}</p>
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
                  ['Monthly allowance / target', number(service.settings.monthlyAllowance)],
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
                    <p className="text-[10px] text-gray-400">Reference only: {metric.referenceDailyLimit > 0 ? `${number(metric.referenceDailyLimit)} / day` : 'disabled'}; {metric.percent == null ? 'percentage unavailable' : `${metric.percent.toFixed(1)}% observed`}, {metric.forecastPercent == null ? 'no forecast yet' : `${metric.forecastPercent.toFixed(1)}% forecast`}. Not verified remaining quota.</p>
                    <div aria-label={`Firestore ${metric.metric} 14-day UTC history`} className="flex gap-1 items-end h-10">
                      {report.firestoreDaily.history.map(day => <div key={day.date} title={`${day.date} UTC: ${number(day[metric.metric])} ${metric.metric}`} className={`flex-1 rounded-t ${day[metric.metric] == null ? 'bg-gray-700' : 'bg-[#14a6d9]'}`} style={{ height: day[metric.metric] == null ? '2px' : `${Math.max(3, day[metric.metric] / peak * 100)}%` }} />)}
                    </div>
                  </div>;
                })}
              </div>}
              {(report.alerts || []).filter(alert => alert.service === service.id).map(alert => <p key={alert.key} role="alert" className="text-amber-300 text-xs">{alert.message} Verify actual provider usage.</p>)}
              <div aria-label={`${service.name} 14-day usage history`} className="flex gap-1 items-end h-14">
                {service.history.map(point => <div key={point.date} title={`${point.date}: ${number(point.count)} ${service.unit}`} className={`flex-1 rounded-t ${point.count == null ? 'bg-gray-700' : 'bg-[#14a6d9]'}`} style={{ height: point.count == null ? '2px' : `${Math.max(3, (point.count / max) * 100)}%` }} />)}
              </div>
              <p className="text-[10px] text-gray-500">Last 14 UTC days; hover for daily counts. Gray = no observation coverage.</p>
              <details className="text-sm text-slate-300">
                <summary className="cursor-pointer">Daily usage values</summary>
                <table className="mt-2 w-full text-left text-sm"><thead><tr><th>Date (UTC)</th><th>Observed {service.unit}</th></tr></thead>
                  <tbody>{service.history.map(point => <tr key={point.date}><td>{point.date}</td><td>{number(point.count)}</td></tr>)}</tbody>
                </table>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
