'use client';

import React, { useState, useId } from 'react';
import {
  FileText,
  Calendar,
  Clock,
  Layers,
  Download,
  CheckSquare,
  Square,
  X,
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const DEFAULT_SECTIONS = [
  { id: 'kpis', label: 'Executive KPI Scorecard', desc: 'Total sessions, users, dwell time, and cache health' },
  { id: 'adoption', label: 'Feature Adoption Distribution', desc: 'Engagement rates across dashboard modules' },
  { id: 'queries', label: 'Query & Operational Activity', desc: 'Top search keywords, active hours, and user mix' },
  { id: 'journeys', label: 'User Journeys & Transition Flows', desc: 'Navigational pathways and exit points' },
  { id: 'reliability', label: 'Platform Reliability & SLA Health', desc: 'API quota headroom and background cache state' },
  { id: 'governance', label: 'Pacing Guardian & Budget Status', desc: 'Spend surge detection and planned budget variance' }
];

const DEFAULT_TIMEZONES = [
  { id: 'Asia/Riyadh', label: 'Riyadh / AST (UTC+3)' },
  { id: 'Asia/Dubai', label: 'Dubai / GST (UTC+4)' },
  { id: 'UTC', label: 'UTC (Coordinated Universal)' },
  { id: 'Europe/London', label: 'London / GMT (UTC+0/+1)' },
  { id: 'America/New_York', label: 'New York / EST (UTC-5/-4)' }
];

export default function PptxExportModal({
  isOpen,
  onClose,
  onExport,
  isExporting = false,
  availableEvents = [],
  currentTimeRange = 'all',
  defaultTimeZone = 'Asia/Riyadh',
  currentUserEmail = 'Platform Administrator'
}) {
  const modalTitleId = useId();
  const todayStr = new Date().toISOString().split('T')[0];
  const nowTimeStr = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());

  const [dateMode, setDateMode] = useState('preset');
  const [presetRange, setPresetRange] = useState(currentTimeRange || 'all');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  const [exportDate, setExportDate] = useState(todayStr);
  const [exportTime, setExportTime] = useState(nowTimeStr);
  const [selectedTimeZone, setSelectedTimeZone] = useState(defaultTimeZone);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);

  const [exportMode, setExportMode] = useState('unified'); // 'unified' | 'separate'
  const [selectedEvents, setSelectedEvents] = useState(
    availableEvents.length > 0 ? availableEvents : ['All Events']
  );

  const [selectedSections, setSelectedSections] = useState(
    DEFAULT_SECTIONS.map(s => s.id)
  );

  const [customTitle, setCustomTitle] = useState('');
  const [feedback, setFeedback] = useState(null);

  if (!isOpen) return null;

  const toggleSection = (id) => {
    setSelectedSections(prev =>
      prev.includes(id)
        ? (prev.length > 1 ? prev.filter(s => s !== id) : prev)
        : [...prev, id]
    );
  };

  const toggleEvent = (ev) => {
    setSelectedEvents(prev =>
      prev.includes(ev)
        ? (prev.length > 1 ? prev.filter(e => e !== ev) : prev)
        : [...prev, ev]
    );
  };

  const selectAllEvents = () => {
    setSelectedEvents([...availableEvents]);
  };

  const handleStartExport = async () => {
    try {
      setFeedback(null);
      await onExport({
        dateMode,
        presetRange,
        startDate: dateMode === 'custom' ? startDate : undefined,
        endDate: dateMode === 'custom' ? endDate : undefined,
        exportDate,
        exportTime: includeTimestamp ? exportTime : undefined,
        timeZone: selectedTimeZone,
        includeTimestamp,
        separateByEvent: exportMode === 'separate',
        selectedEvents: exportMode === 'separate' ? selectedEvents : undefined,
        selectedSections,
        customTitle: customTitle.trim() || undefined,
        authorEmail: currentUserEmail
      });
      setFeedback({ type: 'success', text: 'PowerPoint presentation successfully exported!' });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Export failed' });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#071d33] shadow-2xl text-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-[#0a2540]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#cedc28]/10 border border-[#cedc28]/30 text-[#cedc28]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 id={modalTitleId} className="text-base font-bold text-white flex items-center gap-2">
                Configure Executive PPTX Export
                <span className="rounded-full bg-[#cedc28]/20 px-2 py-0.5 text-[10px] font-bold text-[#cedc28] border border-[#cedc28]/30">
                  Admin Feature
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Configure export timestamp, date parameters, and deck distribution format.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs">
          {/* Parameter 1: Date Range Configuration */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[#14a6d9]" />
              <span>Reporting Horizon & Date Filter</span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: 'all', label: 'All Time' },
                { id: '30d', label: 'Last 30 Days' },
                { id: '7d', label: 'Last 7 Days' },
                { id: 'custom', label: 'Custom Range…' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (opt.id === 'custom') {
                      setDateMode('custom');
                    } else {
                      setDateMode('preset');
                      setPresetRange(opt.id);
                    }
                  }}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all text-center ${
                    (dateMode === 'custom' && opt.id === 'custom') ||
                    (dateMode === 'preset' && presetRange === opt.id)
                      ? 'border-[#cedc28] bg-[#cedc28]/15 text-[#cedc28] font-bold shadow-sm'
                      : 'border-white/10 bg-[#041628] text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {dateMode === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-3 p-3 rounded-xl border border-white/10 bg-[#041628]">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Parameter 2: Export Time & Timezone Configuration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#14a6d9]" />
                <span>Export Timestamp & Timezone</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTimestamp}
                  onChange={e => setIncludeTimestamp(e.target.checked)}
                  className="accent-[#cedc28] rounded"
                />
                <span>Include timestamp in slides</span>
              </label>
            </div>

            {includeTimestamp && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl border border-white/10 bg-[#041628]">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400">Report Date</label>
                  <input
                    type="date"
                    value={exportDate}
                    onChange={e => setExportDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400">Report Time</label>
                  <input
                    type="time"
                    value={exportTime}
                    onChange={e => setExportTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400">Timezone</label>
                  <select
                    value={selectedTimeZone}
                    onChange={e => setSelectedTimeZone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white"
                  >
                    {DEFAULT_TIMEZONES.map(tz => (
                      <option key={tz.id} value={tz.id}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Parameter 3: Deck Distribution Mode (Unified vs. Separate Presentation for Each) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#14a6d9]" />
              <span>Deck Distribution Mode</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setExportMode('unified')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  exportMode === 'unified'
                    ? 'border-[#cedc28] bg-[#cedc28]/10'
                    : 'border-white/10 bg-[#041628] hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${exportMode === 'unified' ? 'border-[#cedc28] bg-[#cedc28]' : 'border-slate-500'}`}>
                    {exportMode === 'unified' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                  </div>
                  <strong className="text-white text-xs">Single Unified Deck</strong>
                </div>
                <p className="text-[10px] text-slate-400 ml-5">
                  Consolidates all events, platforms, and analytics into one comprehensive master presentation.
                </p>
              </div>

              <div
                onClick={() => setExportMode('separate')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  exportMode === 'separate'
                    ? 'border-[#cedc28] bg-[#cedc28]/10'
                    : 'border-white/10 bg-[#041628] hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${exportMode === 'separate' ? 'border-[#cedc28] bg-[#cedc28]' : 'border-slate-500'}`}>
                    {exportMode === 'separate' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                  </div>
                  <strong className="text-white text-xs">Separate Presentation for Each Event</strong>
                </div>
                <p className="text-[10px] text-slate-400 ml-5">
                  Generates and downloads a dedicated, standalone PowerPoint deck tailored for each selected event.
                </p>
              </div>
            </div>

            {/* Event selection pills when in 'separate' mode */}
            {exportMode === 'separate' && availableEvents.length > 0 && (
              <div className="mt-2.5 p-3 rounded-xl border border-white/10 bg-[#041628] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-white">Select Events to Export ({selectedEvents.length} selected):</span>
                  <button
                    type="button"
                    onClick={selectAllEvents}
                    className="text-[#6bd5f7] hover:underline"
                  >
                    Select All
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-1">
                  {availableEvents.map(ev => {
                    const isSelected = selectedEvents.includes(ev);
                    return (
                      <button
                        key={ev}
                        type="button"
                        onClick={() => toggleEvent(ev)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                          isSelected
                            ? 'bg-[#14a6d9]/20 border-[#14a6d9] text-[#6bd5f7]'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{ev}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Parameter 4: Slide Sections Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-[#14a6d9]" />
                <span>Included Slide Modules</span>
              </label>
              <span className="text-[10px] text-slate-400">
                {selectedSections.length} of {DEFAULT_SECTIONS.length} active
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEFAULT_SECTIONS.map(sec => {
                const isChecked = selectedSections.includes(sec.id);
                return (
                  <label
                    key={sec.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isChecked
                        ? 'border-white/20 bg-white/5 text-white'
                        : 'border-white/5 bg-black/20 text-slate-400 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSection(sec.id)}
                      className="mt-0.5 accent-[#cedc28] rounded"
                    />
                    <div>
                      <div className="text-xs font-semibold">{sec.label}</div>
                      <div className="text-[10px] text-slate-400">{sec.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
                feedback.type === 'error'
                  ? 'border-red-500/40 bg-red-500/10 text-red-200'
                  : 'border-lime-400/40 bg-lime-500/10 text-lime-200'
              }`}
            >
              {feedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-white/10 px-5 py-3.5 bg-[#0a2540] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting || (exportMode === 'separate' && selectedEvents.length === 0)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#cedc28] to-[#14a6d9] text-black text-xs font-bold hover:brightness-110 transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>
              {isExporting
                ? (exportMode === 'separate' ? `Generating ${selectedEvents.length} Decks…` : 'Generating Slides…')
                : (exportMode === 'separate' ? `Export ${selectedEvents.length} Event Decks` : 'Generate Executive Deck')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

