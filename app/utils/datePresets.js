// Detailed Date Presets and Calculation Utilities
// Universal CJS export - seamlessly consumed by Next.js client bundler and Node ESM test runner.

function formatYMD(date) {
  if (!date || isNaN(new Date(date).getTime())) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calculatePresetRange(presetId, baseDate = new Date()) {
  const today = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());

  switch (presetId) {
    case 'today':
      return { start: formatYMD(today), end: formatYMD(today), preset: 'today', label: 'Today' };

    case 'yesterday': {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      return { start: formatYMD(y), end: formatYMD(y), preset: 'yesterday', label: 'Yesterday' };
    }

    case 'last_7_days': {
      const s = new Date(today);
      s.setDate(today.getDate() - 6);
      return { start: formatYMD(s), end: formatYMD(today), preset: 'last_7_days', label: 'Last 7 days' };
    }

    case 'last_14_days': {
      const s = new Date(today);
      s.setDate(today.getDate() - 13);
      return { start: formatYMD(s), end: formatYMD(today), preset: 'last_14_days', label: 'Last 14 days' };
    }

    case 'last_28_days': {
      const s = new Date(today);
      s.setDate(today.getDate() - 27);
      return { start: formatYMD(s), end: formatYMD(today), preset: 'last_28_days', label: 'Last 28 days' };
    }

    case 'last_30_days': {
      const s = new Date(today);
      s.setDate(today.getDate() - 29);
      return { start: formatYMD(s), end: formatYMD(today), preset: 'last_30_days', label: 'Last 30 days' };
    }

    case 'last_90_days': {
      const s = new Date(today);
      s.setDate(today.getDate() - 89);
      return { start: formatYMD(s), end: formatYMD(today), preset: 'last_90_days', label: 'Last 90 days' };
    }

    case 'this_week_sun': {
      const s = new Date(today);
      s.setDate(today.getDate() - today.getDay());
      return { start: formatYMD(s), end: formatYMD(today), preset: 'this_week_sun', label: 'This week (Sun - Today)' };
    }

    case 'this_week_mon': {
      const s = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      s.setDate(diff);
      return { start: formatYMD(s), end: formatYMD(today), preset: 'this_week_mon', label: 'This week (Mon - Today)' };
    }

    case 'last_week_sun': {
      const s = new Date(today);
      s.setDate(today.getDate() - today.getDay() - 7);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'last_week_sun', label: 'Last week (Sun - Sat)' };
    }

    case 'last_week_mon': {
      const s = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1) - 7;
      s.setDate(diff);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'last_week_mon', label: 'Last week (Mon - Sun)' };
    }

    case 'this_month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'this_month', label: 'This month' };
    }

    case 'last_month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'last_month', label: 'Last month' };
    }

    case 'this_quarter': {
      const q = Math.floor(today.getMonth() / 3);
      const s = new Date(today.getFullYear(), q * 3, 1);
      const e = new Date(today.getFullYear(), (q + 1) * 3, 0);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'this_quarter', label: 'This quarter' };
    }

    case 'last_quarter': {
      const q = Math.floor(today.getMonth() / 3) - 1;
      const yr = q < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const qIdx = (q + 4) % 4;
      const s = new Date(yr, qIdx * 3, 1);
      const e = new Date(yr, (qIdx + 1) * 3, 0);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'last_quarter', label: 'Last quarter' };
    }

    case 'this_year': {
      const s = new Date(today.getFullYear(), 0, 1);
      const e = new Date(today.getFullYear(), 11, 31);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'this_year', label: 'This year' };
    }

    case 'last_year': {
      const s = new Date(today.getFullYear() - 1, 0, 1);
      const e = new Date(today.getFullYear() - 1, 11, 31);
      return { start: formatYMD(s), end: formatYMD(e), preset: 'last_year', label: 'Last year' };
    }

    case 'ytd': {
      const s = new Date(today.getFullYear(), 0, 1);
      return { start: formatYMD(s), end: formatYMD(today), preset: 'ytd', label: 'Year to date (YTD)' };
    }

    case 'auto':
    default:
      return { start: '', end: '', preset: 'auto', label: 'Auto (All Time)' };
  }
}

function calculateComparisonRange(startStr, endStr, compareType = 'previous_period') {
  if (!startStr || !endStr) return null;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;

  if (compareType === 'previous_year') {
    const compStart = new Date(s);
    compStart.setFullYear(s.getFullYear() - 1);
    const compEnd = new Date(e);
    compEnd.setFullYear(e.getFullYear() - 1);
    return { start: formatYMD(compStart), end: formatYMD(compEnd), label: 'Previous year' };
  }

  // previous_period (same duration preceding)
  const durationMs = e.getTime() - s.getTime() + (24 * 60 * 60 * 1000);
  const compEnd = new Date(s.getTime() - (24 * 60 * 60 * 1000));
  const compStart = new Date(compEnd.getTime() - durationMs + (24 * 60 * 60 * 1000));
  return { start: formatYMD(compStart), end: formatYMD(compEnd), label: 'Previous period' };
}

const PRESET_GROUPS = [
  {
    category: 'Auto',
    items: [
      { id: 'auto', label: 'Auto (All Time)' }
    ]
  },
  {
    category: 'Days',
    items: [
      { id: 'today', label: 'Today' },
      { id: 'yesterday', label: 'Yesterday' },
      { id: 'last_7_days', label: 'Last 7 days' },
      { id: 'last_14_days', label: 'Last 14 days' },
      { id: 'last_28_days', label: 'Last 28 days' },
      { id: 'last_30_days', label: 'Last 30 days' },
      { id: 'last_90_days', label: 'Last 90 days' }
    ]
  },
  {
    category: 'Weeks',
    items: [
      { id: 'this_week_sun', label: 'This week (Sun - Today)' },
      { id: 'this_week_mon', label: 'This week (Mon - Today)' },
      { id: 'last_week_sun', label: 'Last week (Sun - Sat)' },
      { id: 'last_week_mon', label: 'Last week (Mon - Sun)' }
    ]
  },
  {
    category: 'Months & Quarters',
    items: [
      { id: 'this_month', label: 'This month' },
      { id: 'last_month', label: 'Last month' },
      { id: 'this_quarter', label: 'This quarter' },
      { id: 'last_quarter', label: 'Last quarter' }
    ]
  },
  {
    category: 'Years',
    items: [
      { id: 'this_year', label: 'This year' },
      { id: 'last_year', label: 'Last year' },
      { id: 'ytd', label: 'Year to date (YTD)' }
    ]
  },
  {
    category: 'Custom',
    items: [
      { id: 'custom', label: 'Custom range' }
    ]
  }
];

module.exports = {
  formatYMD,
  calculatePresetRange,
  calculateComparisonRange,
  PRESET_GROUPS
};
