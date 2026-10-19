import { NextResponse } from 'next/server';
import { 
  getEventsConfig, 
  getEventsHistory, 
  saveEventsConfig, 
  revertToVersion, 
  resetToFactoryDefaults,
  DEFAULT_EVENTS 
} from '../../../../lib/eventsConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = getEventsConfig();
    const history = getEventsHistory();
    return NextResponse.json({
      success: true,
      config,
      history,
      defaults: DEFAULT_EVENTS
    });
  } catch (error) {
    console.error('Error loading events configuration:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      config: { events: DEFAULT_EVENTS, version: 'v1.0.0' }
    }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action = 'save', author = 'Admin' } = body;

    if (action === 'save') {
      const { events, description = 'Updated events configuration' } = body;
      if (!Array.isArray(events)) {
        return NextResponse.json({ success: false, error: 'Events array is required' }, { status: 400 });
      }
      const actionType = description.toLowerCase().includes('added') 
        ? 'ADD_EVENT' 
        : description.toLowerCase().includes('removed') 
        ? 'DELETE_EVENT' 
        : 'EDIT_EVENT';
      const result = saveEventsConfig(events, description, author, actionType);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'revert') {
      const { versionId } = body;
      if (!versionId) {
        return NextResponse.json({ success: false, error: 'Version ID is required for revert' }, { status: 400 });
      }
      const result = revertToVersion(versionId, author);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'reset') {
      const result = resetToFactoryDefaults(author);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'set-status') {
      const { eventId, status } = body; // 'active' | 'admin_only' | 'inactive'
      const current = getEventsConfig();
      const updatedEvents = current.events.map(ev => {
        if (ev.id !== eventId) return ev;
        const enabled = status !== 'inactive';
        const visibility = status === 'admin_only' ? 'admin_only' : 'public';
        return { ...ev, status, visibility, enabled };
      });
      const label = status === 'admin_only' ? 'Admin Only (Testing)' : status === 'active' ? 'Active (Public)' : 'Inactive';
      const desc = `Changed status of event "${eventId}" to ${label}`;
      const result = saveEventsConfig(updatedEvents, desc, author, 'STATUS_CHANGE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'toggle') {
      const { eventId, enabled } = body;
      const current = getEventsConfig();
      const updatedEvents = current.events.map(ev => 
        ev.id === eventId ? { ...ev, enabled: Boolean(enabled) } : ev
      );
      const desc = `${enabled ? 'Enabled' : 'Disabled'} event "${eventId}"`;
      const result = saveEventsConfig(updatedEvents, desc, author, 'TOGGLE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'update-dates') {
      const { eventId, startDate, endDate } = body;
      const current = getEventsConfig();
      const updatedEvents = current.events.map(ev => 
        ev.id === eventId ? { ...ev, startDate: startDate ?? ev.startDate, endDate: endDate ?? ev.endDate } : ev
      );
      const desc = `Updated date range for event "${eventId}": [${startDate || 'Start'} to ${endDate || 'End'}]`;
      const result = saveEventsConfig(updatedEvents, desc, author, 'DATE_RANGE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'promote') {
      const { eventId } = body;
      const current = getEventsConfig();
      const eventToPromote = current.events.find(ev => ev.id === eventId);
      if (!eventToPromote) {
        return NextResponse.json({ success: false, error: `Event ${eventId} not found` }, { status: 404 });
      }
      const updatedEvents = current.events.map(ev => 
        ev.id === eventId ? { ...ev, status: 'active', visibility: 'public', enabled: true } : ev
      );
      const desc = `Promoted event "${eventToPromote.name}" (${eventToPromote.portfolio}) from Admin Staging to Public Active`;
      const result = saveEventsConfig(updatedEvents, desc, author, 'PROMOTE_LIVE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'validate-sheet') {
      const { gid } = body;
      const baseUrl = process.env.COMBINED_COUNTRY_CSV_URL;
      if (!baseUrl) {
        return NextResponse.json({ success: false, error: 'COMBINED_COUNTRY_CSV_URL not set in environment' }, { status: 500 });
      }
      const targetUrl = baseUrl + (gid ? `&gid=${gid}` : '');
      try {
        const fetchRes = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
        if (!fetchRes.ok) {
          return NextResponse.json({ 
            success: false, 
            valid: false, 
            error: `Google Sheets responded with HTTP ${fetchRes.status} (${fetchRes.statusText})` 
          });
        }
        const text = await fetchRes.text();
        if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('Loading...')) {
          return NextResponse.json({ 
            success: false, 
            valid: false, 
            error: 'Google Sheets returned an HTML login or loading page. Ensure sheet is published to web as CSV.' 
          });
        }

        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) {
          return NextResponse.json({ success: false, valid: false, error: 'Sheet is empty (0 lines)' });
        }

        // Parse header row
        const headerLine = lines[0];
        // Split comma handling simple quotes
        const headers = headerLine.split(',').map(h => h.replace(/^["']|["']$/g, '').trim());

        const rowCount = lines.length - 1;
        const lowerHeaders = headers.map(h => h.toLowerCase());

        const hasSpend = lowerHeaders.some(h => h.includes('spend') || h.includes('cost'));
        const hasDate = lowerHeaders.some(h => h.includes('date') || h.includes('day'));
        const hasImpressions = lowerHeaders.some(h => h.includes('impression'));
        const hasClicks = lowerHeaders.some(h => h.includes('click'));
        const hasEventName = lowerHeaders.some(h => h.includes('event name') || h === 'event' || h.includes('campaign'));

        // Sample some events from data lines if present
        const eventColIdx = headers.findIndex(h => /event name db|event name|event/i.test(h));
        const sampleEvents = new Set();
        if (eventColIdx !== -1) {
          for (let i = 1; i < Math.min(lines.length, 100); i++) {
            const cols = lines[i].split(',');
            if (cols[eventColIdx]) {
              const evVal = cols[eventColIdx].replace(/^["']|["']$/g, '').trim();
              if (evVal) sampleEvents.add(evVal);
            }
          }
        }

        return NextResponse.json({
          success: true,
          valid: true,
          rowCount,
          headers,
          hasSpend,
          hasDate,
          hasImpressions,
          hasClicks,
          hasEventName,
          sampleEvents: Array.from(sampleEvents).slice(0, 5)
        });
      } catch (err) {
        return NextResponse.json({ 
          success: false, 
          valid: false, 
          error: `Failed to connect to sheet: ${err.message}` 
        });
      }
    }

    if (action === 'import') {
      const { importedConfig } = body;
      if (!importedConfig || !Array.isArray(importedConfig.events)) {
        return NextResponse.json({ success: false, error: 'Invalid imported config structure' }, { status: 400 });
      }
      const result = saveEventsConfig(importedConfig.events, 'Imported configuration from JSON file', author, 'IMPORT');
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('Error handling events configuration POST:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
