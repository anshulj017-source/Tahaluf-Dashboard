const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Returns the week index from campStart.
 * Week 0: campStart to first Sunday.
 * Week 1+: Following Monday to Sunday (7-day blocks).
 */
export function getWeekIndex(targetDate, campStart) {
  if (!targetDate || !campStart) return 0;
  const startUTC = new Date(Date.UTC(campStart.getUTCFullYear(), campStart.getUTCMonth(), campStart.getUTCDate()));
  const targetUTC = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
  
  const daysToSunday = (7 - startUTC.getUTCDay()) % 7;
  const firstWeekEnd = new Date(startUTC.getTime() + daysToSunday * MS_PER_DAY);
  if (targetUTC <= firstWeekEnd) return 0;
  
  const diffFromNextMonday = Math.floor((targetUTC.getTime() - (firstWeekEnd.getTime() + MS_PER_DAY)) / MS_PER_DAY);
  return 1 + Math.floor(diffFromNextMonday / 7);
}

/**
 * Returns the date boundaries [startDate, endDate] for a given weekIndex.
 */
export function getWeekDates(weekIdx, campStart) {
  const startUTC = new Date(Date.UTC(campStart.getUTCFullYear(), campStart.getUTCMonth(), campStart.getUTCDate()));
  const daysToSunday = (7 - startUTC.getUTCDay()) % 7;
  const firstWeekEnd = new Date(startUTC.getTime() + daysToSunday * MS_PER_DAY);
  
  if (weekIdx === 0) {
    return [startUTC, firstWeekEnd];
  }
  
  const startMs = firstWeekEnd.getTime() + MS_PER_DAY + (weekIdx - 1) * 7 * MS_PER_DAY;
  const endMs = startMs + 6 * MS_PER_DAY;
  return [new Date(startMs), new Date(endMs)];
}

/**
 * Formats a date range cleanly: e.g. "Jun 2 - Jun 7, 2026" or "Jun 28 - Jul 4, 2026"
 */
export function formatWeekDateRange(startDate, endDate) {
  if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '';
  
  const monthMin = startDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const dayMin = startDate.getUTCDate();
  const yearMin = startDate.getUTCFullYear();
  
  const monthMax = endDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const dayMax = endDate.getUTCDate();
  const yearMax = endDate.getUTCFullYear();
  
  if (yearMin === yearMax) {
    if (monthMin === monthMax) {
      return `${monthMin} ${dayMin}-${dayMax}, ${yearMax}`;
    }
    return `${monthMin} ${dayMin} - ${monthMax} ${dayMax}, ${yearMax}`;
  }
  return `${monthMin} ${dayMin}, ${yearMin} - ${monthMax} ${dayMax}, ${yearMax}`;
}

/**
 * Generates the full contiguous client week timeline for an event.
 * Returns array of week descriptors sorted from W{max} down to W0:
 * [
 *   {
 *     week: "W20 '26",
 *     countdown: 20,
 *     weekIndex: 0,
 *     startDate: Date,
 *     endDate: Date,
 *     dateRange: "Jun 2 - Jun 7, 2026"
 *   },
 *   ...
 *   {
 *     week: "W0 '26",
 *     countdown: 0,
 *     weekIndex: totalWeeks,
 *     startDate: Date,
 *     endDate: Date,
 *     dateRange: "Oct 19 - Oct 21, 2026"
 *   }
 * ]
 */
export function generateEventWeekTimeline(campStart, eventStart) {
  if (!campStart || !eventStart || isNaN(campStart.getTime()) || isNaN(eventStart.getTime())) {
    return [];
  }
  
  const startUTC = new Date(Date.UTC(campStart.getUTCFullYear(), campStart.getUTCMonth(), campStart.getUTCDate()));
  const eventUTC = new Date(Date.UTC(eventStart.getUTCFullYear(), eventStart.getUTCMonth(), eventStart.getUTCDate()));
  
  const totalWeeks = getWeekIndex(eventUTC, startUTC);
  const yearSuffix = eventUTC.getUTCFullYear() % 100;
  const timeline = [];

  for (let w = 0; w <= totalWeeks; w++) {
    const countdown = totalWeeks - w;
    const [startDate, endDate] = getWeekDates(w, startUTC);
    // If it's the final week (w === totalWeeks), cap with eventUTC if it ends before Sunday
    const effectiveEnd = (w === totalWeeks && eventUTC < endDate) ? eventUTC : endDate;
    
    timeline.push({
      week: `W${countdown} '${yearSuffix}`,
      countdown,
      weekIndex: w,
      startDate,
      endDate: effectiveEnd,
      dateRange: formatWeekDateRange(startDate, effectiveEnd)
    });
  }

  return timeline;
}
