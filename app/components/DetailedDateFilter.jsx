"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Calendar, ChevronDown, ChevronLeft, ChevronRight, 
  RotateCcw, X, Check 
} from 'lucide-react';

import { 
  formatYMD, 
  calculatePresetRange, 
  PRESET_GROUPS 
} from '../utils/datePresets';

export { formatYMD, calculatePresetRange, PRESET_GROUPS };

const QUICK_CHIPS = [
  { id: 'auto', label: 'All' },
  { id: 'last_7_days', label: '7D' },
  { id: 'last_14_days', label: '14D' },
  { id: 'last_30_days', label: '30D' },
  { id: 'this_month', label: 'This Mo' },
  { id: 'ytd', label: 'YTD' },
];

export default function DetailedDateFilter({ 
  label = "Date Range", 
  dateRange = { start: '', end: '', preset: 'auto' }, 
  onChange,
  widthClass
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Draft state while popover is open
  const [draftStart, setDraftStart] = useState(dateRange.start || '');
  const [draftEnd, setDraftEnd] = useState(dateRange.end || '');
  const [draftPreset, setDraftPreset] = useState(dateRange.preset || (dateRange.start ? 'custom' : 'auto'));

  // Calendar month/year navigation state
  const initialCalendarDate = useMemo(() => {
    if (dateRange.start) {
      const d = new Date(dateRange.start);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [dateRange.start]);

  const [calYear, setCalYear] = useState(initialCalendarDate.getFullYear());
  const [calMonth, setCalMonth] = useState(initialCalendarDate.getMonth()); // 0-indexed
  const [hoverDate, setHoverDate] = useState(null);
  const [selectionStep, setSelectionStep] = useState(0); // 0 = start, 1 = end

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync draft when external dateRange prop changes
  useEffect(() => {
    setDraftStart(dateRange.start || '');
    setDraftEnd(dateRange.end || '');
    setDraftPreset(dateRange.preset || (dateRange.start ? 'custom' : 'auto'));

    if (dateRange.start) {
      const d = new Date(dateRange.start);
      if (!isNaN(d.getTime())) {
        setCalYear(d.getFullYear());
        setCalMonth(d.getMonth());
      }
    }
  }, [dateRange]);

  // Handle Preset Selection
  const handleSelectPreset = (presetId) => {
    setDraftPreset(presetId);
    setSelectionStep(0);
    if (presetId === 'auto') {
      setDraftStart('');
      setDraftEnd('');
      return;
    }
    if (presetId === 'custom') {
      return;
    }
    const res = calculatePresetRange(presetId);
    setDraftStart(res.start);
    setDraftEnd(res.end);
    if (res.start) {
      const d = new Date(res.start);
      setCalYear(d.getFullYear());
      setCalMonth(d.getMonth());
    }
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalYear(calYear - 1);
      setCalMonth(11);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalYear(calYear + 1);
      setCalMonth(0);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  // Calendar Day Click
  const handleDayClick = (dayStr) => {
    setDraftPreset('custom');
    if (selectionStep === 0 || !draftStart || (draftStart && draftEnd)) {
      setDraftStart(dayStr);
      setDraftEnd('');
      setSelectionStep(1);
    } else {
      if (dayStr < draftStart) {
        setDraftStart(dayStr);
        setDraftEnd(draftStart);
      } else {
        setDraftEnd(dayStr);
      }
      setSelectionStep(0);
    }
  };

  // 42-cell calendar grid
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun
    const totalDays = lastDay.getDate();

    const cells = [];
    const prevMonthLastDay = new Date(calYear, calMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(calYear, calMonth - 1, d);
      cells.push({
        dateStr: formatYMD(prevDate),
        dayNum: d,
        isCurrentMonth: false
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      const curDate = new Date(calYear, calMonth, i);
      cells.push({
        dateStr: formatYMD(curDate),
        dayNum: i,
        isCurrentMonth: true
      });
    }

    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(calYear, calMonth + 1, i);
      cells.push({
        dateStr: formatYMD(nextDate),
        dayNum: i,
        isCurrentMonth: false
      });
    }

    return cells;
  }, [calYear, calMonth]);

  // Apply
  const handleApply = () => {
    const payload = {
      start: draftStart,
      end: draftEnd,
      preset: draftPreset
    };
    onChange(payload);
    setIsOpen(false);
  };

  // Reset to All Time
  const handleReset = () => {
    const payload = {
      start: '',
      end: '',
      preset: 'auto'
    };
    onChange(payload);
    setDraftStart('');
    setDraftEnd('');
    setDraftPreset('auto');
    setIsOpen(false);
  };

  // Format Button Label
  const formatButtonLabel = () => {
    if (!dateRange.start && !dateRange.end) {
      return 'All Dates';
    }
    const foundPreset = PRESET_GROUPS.flatMap(g => g.items).find(i => i.id === dateRange.preset);
    if (foundPreset && foundPreset.id !== 'custom' && foundPreset.id !== 'auto') {
      return foundPreset.label;
    }
    const s = dateRange.start ? new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...';
    const e = dateRange.end ? new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '...';
    return `${s} - ${e}`;
  };

  const isActiveFilter = Boolean(dateRange.start || dateRange.end || (dateRange.preset && dateRange.preset !== 'auto'));

  // Day range count
  const dayCount = useMemo(() => {
    if (!draftStart || !draftEnd) return null;
    const diff = Math.round((new Date(draftEnd) - new Date(draftStart)) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : null;
  }, [draftStart, draftEnd]);

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return (
    <div ref={wrapperRef} className={`relative ${widthClass || 'w-[108px] xl:w-[116px]'} shrink-0 z-40`}>
      <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-1 flex items-center justify-between">
        <span>{label}</span>
        {isActiveFilter && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#cedc28] animate-pulse"></span>
        )}
      </span>

      {/* TRIGGER BUTTON: Compact, matching MultiSelect height */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1.5 surface-inset border rounded-lg text-[10px] font-bold cursor-pointer flex justify-between items-center transition-all ${
          isOpen 
            ? 'border-[#cedc28] ring-1 ring-[#cedc28]/30 bg-[#0a2442]' 
            : isActiveFilter 
            ? 'border-[#cedc28]/60 text-white shadow-[0_0_8px_rgba(206,220,40,0.15)]' 
            : 'border-[#cedc28]/30 text-[#eef7f5] hover:border-[#cedc28]'
        }`}
        title="Open Date Range Selector"
      >
        <div className="flex items-center gap-1 truncate pr-1">
          <Calendar className={`w-3 h-3 flex-shrink-0 ${isActiveFilter ? 'text-[#cedc28]' : 'text-[#14a6d9]'}`} />
          <span className="truncate text-[10px] xl:text-[10.5px]">{formatButtonLabel()}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180 text-[#cedc28]' : ''}`} />
      </div>

      {/* FLOATING DROPDOWN: Uses w-0 h-0 anchor so it NEVER pulls or shifts dashboard layout */}
      {isOpen && (
        <div className="absolute top-full left-0 w-0 h-0 z-[100] pointer-events-none">
          <div className="pointer-events-auto w-[350px] sm:w-[370px] mt-2 card-surface backdrop-blur-3xl bg-[#0a2442]/98 border border-[#cedc28]/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col p-3 gap-2.5 text-white animate-in fade-in zoom-in-95 duration-100">
            
            {/* 1. PRESET DROPDOWN + QUICK CHIPS */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider">Date Preset</span>
                <select
                  value={draftPreset}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="bg-black/50 border border-gray-600/60 rounded-md px-2 py-1 text-xs text-white outline-none font-semibold cursor-pointer max-w-[210px] truncate"
                >
                  {PRESET_GROUPS.map(group => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map(item => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Quick Preset Chips */}
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                {QUICK_CHIPS.map(chip => {
                  const isSel = draftPreset === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => handleSelectPreset(chip.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                        isSel 
                          ? 'bg-[#cedc28] text-black shadow-sm' 
                          : 'bg-black/30 text-gray-300 hover:bg-white/10 hover:text-white border border-gray-700/50'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. DIRECT START / END INPUTS */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-700/40">
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Start Date</label>
                <input 
                  type="date"
                  value={draftStart}
                  onChange={(e) => {
                    setDraftStart(e.target.value);
                    setDraftPreset('custom');
                    if (e.target.value) {
                      const d = new Date(e.target.value);
                      if (!isNaN(d.getTime())) {
                        setCalYear(d.getFullYear());
                        setCalMonth(d.getMonth());
                      }
                    }
                  }}
                  className="w-full px-2 py-1 bg-black/40 border border-gray-600/50 rounded-md text-[11px] text-white outline-none focus:border-[#cedc28] font-mono cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">End Date</label>
                <input 
                  type="date"
                  value={draftEnd}
                  onChange={(e) => {
                    setDraftEnd(e.target.value);
                    setDraftPreset('custom');
                  }}
                  className="w-full px-2 py-1 bg-black/40 border border-gray-600/50 rounded-md text-[11px] text-white outline-none focus:border-[#cedc28] font-mono cursor-pointer"
                />
              </div>
            </div>

            {/* 3. COMPACT CALENDAR */}
            <div className="bg-black/30 rounded-lg p-2 border border-gray-700/50 flex flex-col gap-1">
              {/* Month / Year Navigator */}
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-white/10 rounded text-gray-300 hover:text-white transition-colors"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold text-white tracking-wide">
                  {monthNames[calMonth]} {calYear}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-white/10 rounded text-gray-300 hover:text-white transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 text-center text-[9px] font-bold text-[#14a6d9] py-0.5 border-b border-gray-700/40">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => (
                  <div key={w}>{w}</div>
                ))}
              </div>

              {/* Day cells (compact 24px) */}
              <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px] pt-0.5">
                {calendarCells.map(cell => {
                  const isStart = draftStart === cell.dateStr;
                  const isEnd = draftEnd === cell.dateStr;
                  const inRange = Boolean(
                    draftStart && draftEnd && 
                    cell.dateStr > draftStart && cell.dateStr < draftEnd
                  );
                  const inHoverRange = Boolean(
                    selectionStep === 1 && draftStart && !draftEnd && hoverDate &&
                    ((cell.dateStr >= draftStart && cell.dateStr <= hoverDate) ||
                     (cell.dateStr <= draftStart && cell.dateStr >= hoverDate))
                  );

                  let cellStyle = "text-gray-300 hover:bg-[#14a6d9]/20 hover:text-white rounded";
                  if (!cell.isCurrentMonth) {
                    cellStyle = "text-gray-600 hover:bg-white/5 rounded";
                  }
                  if (inRange) {
                    cellStyle = "bg-[#cedc28]/25 text-white font-semibold rounded-none";
                  } else if (inHoverRange) {
                    cellStyle = "bg-[#14a6d9]/25 text-white rounded-none";
                  }
                  if (isStart || isEnd) {
                    cellStyle = "bg-[#cedc28] text-black font-black rounded shadow-sm";
                  }

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => handleDayClick(cell.dateStr)}
                      onMouseEnter={() => setHoverDate(cell.dateStr)}
                      className={`h-6 text-[11px] flex items-center justify-center transition-all ${cellStyle}`}
                    >
                      {cell.dayNum}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. FOOTER ACTIONS */}
            <div className="pt-2 border-t border-gray-700/40 flex items-center justify-between gap-2">
              <div className="text-[10px] text-gray-400 truncate">
                {dayCount ? `${dayCount} days selected` : draftStart ? '1 day' : 'All Time'}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2 py-1 rounded text-[11px] font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
                  title="Reset to All Time"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-3.5 py-1 rounded-md text-[11px] font-bold bg-[#cedc28] text-black hover:bg-[#cedc28]/90 transition-all shadow-md active:scale-95"
                >
                  Apply
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
