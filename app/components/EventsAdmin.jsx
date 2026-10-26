"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Plus, Edit2, Edit3, Trash2, History, RotateCcw, 
  Check, CheckCircle2, XCircle, AlertCircle, Filter, 
  Download, Upload, Search, Layers, Settings, Settings2, RefreshCw, 
  Copy, Save, FileText, ChevronRight, ChevronDown, X, ArrowUpDown,
  Shield, Lock, Eye, EyeOff, User, Code, Sliders
} from 'lucide-react';

export default function EventsAdmin({ currentUserEmail = 'admin@tahaluf.com', initialEvents = [] }) {
  const currentAuthor = currentUserEmail || 'admin@tahaluf.com';
  const hasInitial = Array.isArray(initialEvents) && initialEvents.length > 0;
  const [config, setConfig] = useState(hasInitial ? { events: initialEvents, version: 'v1.0.0' } : null);
  const [events, setEvents] = useState(hasInitial ? initialEvents : []);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPortfolio, setSelectedPortfolio] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Modals state
  const [editingEvent, setEditingEvent] = useState(null);
  const [originalEventId, setOriginalEventId] = useState(null);
  const [modalTab, setModalTab] = useState('form'); // 'form' | 'json'
  const [jsonConfigText, setJsonConfigText] = useState('');
  const [jsonConfigError, setJsonConfigError] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [dateModalEvent, setDateModalEvent] = useState(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(null);
  const [confirmResetModal, setConfirmResetModal] = useState(false);
  const [confirmPromoteEvent, setConfirmPromoteEvent] = useState(null);
  const [validatingSheet, setValidatingSheet] = useState(false);
  const [sheetValidationResult, setSheetValidationResult] = useState(null);

  // Quick date edit state
  const [quickStartDate, setQuickStartDate] = useState('');
  const [quickEndDate, setQuickEndDate] = useState('');

  // Fetch events config and version history
  const fetchConfig = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/events');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch events configuration');
      }
      const data = await res.json();
      setConfig(data.config || {});
      setEvents(data.config?.events || []);
      setHistory(data.history || []);
    } catch (err) {
      console.error(err);
      if (!isBackground) setError(err.message || 'Error connecting to events admin API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig(hasInitial);
  }, []);

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // 1. Cycle Event Status: Active (Public) -> Admin Only (Testing) -> Inactive (Off) -> Active (Public)
  const handleCycleStatus = async (event) => {
    let nextStatus = 'active';

    const currentStatus = (event.status === 'admin_only' || event.visibility === 'admin_only') 
      ? 'admin_only' 
      : (event.enabled && event.status !== 'inactive') 
      ? 'active' 
      : 'inactive';

    if (currentStatus === 'active') {
      nextStatus = 'admin_only';
    } else if (currentStatus === 'admin_only') {
      nextStatus = 'inactive';
    } else {
      nextStatus = 'active';
    }

    const previousEvents = [...events];
    setEvents(events.map(ev => ev.id === event.id ? { 
      ...ev, 
      status: nextStatus, 
      visibility: nextStatus === 'admin_only' ? 'admin_only' : 'public',
      enabled: nextStatus !== 'inactive'
    } : ev));

    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-status',
          eventId: event.id,
          status: nextStatus,
          author: currentAuthor
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update event status');
      setConfig(data.config);
      setEvents(data.config.events);
      setHistory(data.history);
      
      const label = nextStatus === 'admin_only' 
        ? 'Admin Only (Testing - hidden from regular users)' 
        : nextStatus === 'active' 
        ? 'Active (Public to all users)' 
        : 'Inactive (Disabled)';
      showNotification(`${event.name} is now ${label}`);
    } catch (err) {
      console.error(err);
      setEvents(previousEvents);
      setError(`Error updating status: ${err.message}`);
    }
  };

  // 2. Quick Date Range Update
  const openDateModal = (event) => {
    setDateModalEvent(event);
    setQuickStartDate(event.startDate || '');
    setQuickEndDate(event.endDate || '');
  };

  const handleSaveQuickDate = async () => {
    if (!dateModalEvent) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-dates',
          eventId: dateModalEvent.id,
          startDate: quickStartDate,
          endDate: quickEndDate,
          author: currentAuthor
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update date range');
      setConfig(data.config);
      setEvents(data.config.events);
      setHistory(data.history);
      setDateModalEvent(null);
      showNotification(`Date range updated for ${dateModalEvent.name}`);
    } catch (err) {
      console.error(err);
      setError(`Error updating date range: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Open Full Configuration Editor for an Existing Event
  const openEditModal = (event) => {
    const fullEvent = {
      id: event.id || '',
      name: event.name || '',
      sourceName: event.sourceName || '',
      portfolio: event.portfolio || 'P1',
      enabled: event.enabled ?? true,
      status: event.status || (event.enabled ? 'active' : 'inactive'),
      visibility: event.visibility || (event.status === 'admin_only' ? 'admin_only' : 'public'),
      sheetType: event.sheetType || 'combined',
      gid: event.gid || '',
      plannedGid: event.plannedGid || '',
      plannedType: event.plannedType || 'standard',
      launchDate: event.launchDate || '2026-12-01',
      startDate: event.startDate || '',
      endDate: event.endDate || '',
      dateFilterMode: event.dateFilterMode || 'none',
      eventType: event.eventType || 'Exhibition',
      description: event.description || '',
      channelFilters: {
        meta: event.channelFilters?.meta ?? true,
        google: event.channelFilters?.google ?? true,
        linkedin: event.channelFilters?.linkedin ?? true,
        tiktok: event.channelFilters?.tiktok ?? true,
        x: event.channelFilters?.x ?? true,
      },
      fieldAliases: event.fieldAliases || {},
      autoPublishDate: event.autoPublishDate || ''
    };
    setEditingEvent(fullEvent);
    setOriginalEventId(event.id);
    setIsAddingNew(false);
    setModalTab('form');
    setJsonConfigText(JSON.stringify(fullEvent, null, 2));
    setJsonConfigError(null);
    setSheetValidationResult(null);
  };

  // Open Full Configuration Editor for a New Event
  const openAddModal = () => {
    const newEvent = {
      id: '',
      name: '',
      sourceName: '',
      portfolio: 'P1',
      enabled: true,
      status: 'admin_only',
      visibility: 'admin_only',
      sheetType: 'combined',
      gid: '',
      plannedGid: '',
      plannedType: 'standard',
      launchDate: '2026-12-01',
      startDate: '',
      endDate: '',
      dateFilterMode: 'none',
      eventType: 'Exhibition',
      description: '',
      channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true },
      fieldAliases: {},
      autoPublishDate: ''
    };
    setEditingEvent(newEvent);
    setOriginalEventId(null);
    setIsAddingNew(true);
    setModalTab('form');
    setJsonConfigText(JSON.stringify(newEvent, null, 2));
    setJsonConfigError(null);
    setSheetValidationResult(null);
  };

  // Switch between Visual Form tab and Raw JSON Config tab
  const handleSwitchTab = (tab) => {
    if (tab === 'json') {
      setJsonConfigText(JSON.stringify(editingEvent, null, 2));
      setJsonConfigError(null);
    } else if (tab === 'form') {
      if (jsonConfigText) {
        try {
          const parsed = JSON.parse(jsonConfigText);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Configuration must be a valid JSON object');
          }
          setEditingEvent(parsed);
          setJsonConfigError(null);
        } catch (err) {
          setJsonConfigError(`Invalid JSON: ${err.message}`);
          return;
        }
      }
    }
    setModalTab(tab);
  };

  // 3. Save Add / Edit Event
  const handleSaveEvent = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingEvent) return;

    let targetEventObj = { ...editingEvent };

    // If currently on JSON tab, validate & parse latest JSON text
    if (modalTab === 'json') {
      try {
        const parsed = JSON.parse(jsonConfigText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Configuration must be a JSON object');
        }
        targetEventObj = parsed;
      } catch (err) {
        setJsonConfigError(`Cannot save: Invalid JSON (${err.message})`);
        return;
      }
    }

    if (!targetEventObj.name || !targetEventObj.name.trim()) {
      alert('Event name is required');
      return;
    }

    setSaving(true);
    const isNew = isAddingNew;
    let updatedEventsList;

    const finalStatus = targetEventObj.status || (targetEventObj.enabled ? 'active' : 'inactive');
    const finalVisibility = finalStatus === 'admin_only' ? 'admin_only' : 'public';
    const finalEnabled = finalStatus !== 'inactive';

    const cleanEventObj = {
      ...targetEventObj,
      status: finalStatus,
      visibility: finalVisibility,
      enabled: finalEnabled
    };

    if (isNew) {
      const newId = cleanEventObj.id?.trim() || cleanEventObj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const newEventObj = {
        ...cleanEventObj,
        id: newId
      };
      updatedEventsList = [...events, newEventObj];
    } else {
      const targetId = originalEventId || cleanEventObj.id;
      updatedEventsList = events.map(ev => ev.id === targetId ? cleanEventObj : ev);
    }

    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          events: updatedEventsList,
          description: isNew ? `Added new event "${cleanEventObj.name}"` : `Modified complete settings for "${cleanEventObj.name}"`,
          author: currentAuthor
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save event');
      setConfig(data.config);
      setEvents(data.config.events);
      setHistory(data.history);
      setEditingEvent(null);
      setOriginalEventId(null);
      setIsAddingNew(false);
      showNotification(`${cleanEventObj.name} successfully ${isNew ? 'added' : 'updated'}`);
    } catch (err) {
      console.error(err);
      setError(`Error saving event: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 4. Delete Event
  const handleDeleteEvent = async (eventId, eventName) => {
    setSaving(true);
    const updatedEventsList = events.filter(ev => ev.id !== eventId);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          events: updatedEventsList,
          description: `Removed event "${eventName}"`,
          author: currentAuthor
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete event');
      setConfig(data.config);
      setEvents(data.config.events);
      setHistory(data.history);
      setConfirmDeleteEvent(null);
      showNotification(`Event "${eventName}" deleted`);
    } catch (err) {
      console.error(err);
      setError(`Error deleting event: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 4b. Live Sheet Connection Validation
  const handleValidateSheet = async () => {
    if (!editingEvent) return;
    setValidatingSheet(true);
    setSheetValidationResult(null);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate-sheet',
          gid: editingEvent.gid || ''
        })
      });
      const data = await res.json();
      setSheetValidationResult(data);
    } catch (err) {
      setSheetValidationResult({ valid: false, error: err.message });
    } finally {
      setValidatingSheet(false);
    }
  };

  // 4c. Promote Event from Staging (Admin Only) to Live (Public Active)
  const handlePromoteEvent = async (event) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'promote',
          eventId: event.id,
          author: currentAuthor
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to promote event');
      setConfig(data.config);
      setEvents(data.config.events);
      setHistory(data.history);
      setConfirmPromoteEvent(null);
      showNotification(`🚀 "${event.name}" is now live and visible to all dashboard users!`);
    } catch (err) {
      console.error(err);
      setError(`Error promoting event: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 5. Version Control Rollback / Revert
  const handleRevertVersion = async (versionId, description) => {
    if (!window.confirm(`Are you sure you want to revert to ${versionId}? Current settings will be replaced with that snapshot.`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revert',
          versionId,
          author: currentAuthor
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to revert version');
      setConfig(data.config);
      setEvents(data.config.events);
      setHistory(data.history);
      setShowHistoryModal(false);
      showNotification(`Dashboard configuration successfully rolled back to ${versionId}`);
    } catch (err) {
      console.error(err);
      setError(`Error reverting version: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 6. Reset to Factory Defaults
  const handleResetDefaults = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', author: currentAuthor })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset defaults');
      setConfig(data.config);
      setEvents(data.config.events);
      setHistory(data.history);
      setConfirmResetModal(false);
      showNotification('Configuration reset to factory defaults (8 Tahaluf events)');
    } catch (err) {
      console.error(err);
      setError(`Error resetting to defaults: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 7. Export Configuration as JSON
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `tahaluf-events-config-${config?.version || 'v1'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showNotification('Configuration exported to JSON file');
  };

  // 8. Import Configuration from JSON
  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed || !Array.isArray(parsed.events)) {
          throw new Error('Invalid JSON format. Expected { events: [...] }');
        }
        setSaving(true);
        const res = await fetch('/api/admin/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import',
            importedConfig: parsed,
            author: currentAuthor
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to import JSON');
        setConfig(data.config);
        setEvents(data.config.events);
        setHistory(data.history);
        showNotification(`Imported ${parsed.events.length} events successfully!`);
      } catch (err) {
        console.error(err);
        alert(`Failed to import configuration: ${err.message}`);
      } finally {
        setSaving(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Duplicate Event Template
  const handleDuplicateEvent = (event) => {
    const dupe = {
      ...event,
      id: `${event.id}-copy`,
      name: `${event.name} (Copy)`,
      description: `Copy of ${event.name}`,
      status: 'admin_only',
      visibility: 'admin_only',
      enabled: true,
      channelFilters: {
        meta: event.channelFilters?.meta ?? true,
        google: event.channelFilters?.google ?? true,
        linkedin: event.channelFilters?.linkedin ?? true,
        tiktok: event.channelFilters?.tiktok ?? true,
        x: event.channelFilters?.x ?? true,
      }
    };
    setEditingEvent(dupe);
    setOriginalEventId(null);
    setIsAddingNew(true);
    setModalTab('form');
    setJsonConfigText(JSON.stringify(dupe, null, 2));
    setJsonConfigError(null);
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const matchesSearch = !searchQuery || 
        ev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.sourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ev.gid && String(ev.gid).includes(searchQuery)) ||
        (ev.portfolio && ev.portfolio.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesPortfolio = selectedPortfolio === 'ALL' || ev.portfolio === selectedPortfolio;

      const isPublic = ev.enabled && ev.status !== 'inactive' && ev.status !== 'admin_only' && ev.visibility !== 'admin_only';
      const isAdminOnly = (ev.status === 'admin_only' || ev.visibility === 'admin_only') && ev.enabled && ev.status !== 'inactive';
      const isInactive = !ev.enabled || ev.status === 'inactive';

      let matchesStatus = true;
      if (selectedStatus === 'PUBLIC ACTIVE') matchesStatus = isPublic;
      else if (selectedStatus === 'ADMIN ONLY') matchesStatus = isAdminOnly;
      else if (selectedStatus === 'INACTIVE') matchesStatus = isInactive;

      return matchesSearch && matchesPortfolio && matchesStatus;
    });
  }, [events, searchQuery, selectedPortfolio, selectedStatus]);

  const publicActiveCount = events.filter(e => e.enabled && e.status !== 'inactive' && e.status !== 'admin_only' && e.visibility !== 'admin_only').length;
  const adminOnlyCount = events.filter(e => e.enabled && (e.status === 'admin_only' || e.visibility === 'admin_only') && e.status !== 'inactive').length;
  const p1Count = events.filter(e => e.portfolio === 'P1').length;
  const p3Count = events.filter(e => e.portfolio === 'P3').length;

  const renderActionBadge = (ver) => {
    const act = ver.action || '';
    const desc = (ver.description || '').toLowerCase();

    if (act === 'REVERT' || desc.includes('reverted')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> Rollback / Restored
        </span>
      );
    }
    if (act === 'PROMOTE_LIVE' || desc.includes('promoted')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
          <span>🚀</span> Promoted to Live
        </span>
      );
    }
    if (act === 'ADD_EVENT' || desc.includes('added new event') || desc.includes('added event')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Event Added
        </span>
      );
    }
    if (act === 'DELETE_EVENT' || desc.includes('removed event') || desc.includes('deleted')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> Event Removed
        </span>
      );
    }
    if (act === 'STATUS_CHANGE' || desc.includes('changed status')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1">
          <Eye className="w-3 h-3" /> Status Changed
        </span>
      );
    }
    if (act === 'DATE_RANGE' || desc.includes('date range')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
          <Calendar className="w-3 h-3" /> Dates Adjusted
        </span>
      );
    }
    if (act === 'RESET' || desc.includes('reset')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Factory Reset
        </span>
      );
    }
    if (act === 'IMPORT' || desc.includes('imported')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
          <Download className="w-3 h-3" /> Config Imported
        </span>
      );
    }
    if (act === 'INIT') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/20 text-gray-300 border border-gray-500/40 flex items-center gap-1">
          <Shield className="w-3 h-3" /> Initial Version
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/40 flex items-center gap-1">
        <Edit2 className="w-3 h-3" /> Modified
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* TOP HEADER & ACTION BUTTONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white tracking-wide uppercase">Events & Data Configuration</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#cedc28]/20 text-[#cedc28] border border-[#cedc28]/40">
              {config?.version || 'v1.0.0'}
            </span>
          </div>
          <p className="text-[#14a6d9] text-xs font-medium mt-1">
            Manage events, date ranges, sheet GIDs, portfolio assignments, and version control
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Version History Button */}
          <button
            onClick={() => setShowHistoryModal(true)}
            className="px-3.5 py-2 bg-[#0a2442] hover:bg-[#0a2442]/80 border border-[#14a6d9]/40 text-[#14a6d9] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm"
          >
            <History className="w-3.5 h-3.5" />
            History ({history.length})
          </button>

          {/* Export JSON */}
          <button
            onClick={handleExportJson}
            title="Download JSON backup"
            className="p-2 bg-[#0a2442] hover:bg-white/10 border border-gray-600/40 text-gray-300 rounded-xl transition-all"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Import JSON */}
          <label 
            title="Import configuration from JSON" 
            className="p-2 bg-[#0a2442] hover:bg-white/10 border border-gray-600/40 text-gray-300 rounded-xl transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>

          {/* Reset Defaults */}
          <button
            onClick={() => setConfirmResetModal(true)}
            title="Reset to factory defaults"
            className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          {/* Add New Event Button */}
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-[#cedc28] hover:bg-[#cedc28]/90 text-[#1a302e] rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(206,220,40,0.3)] transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        </div>
      </div>

      {/* NOTIFICATIONS & ALERTS */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-[#cedc28]/15 border border-[#cedc28]/40 text-[#cedc28] rounded-xl text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#cedc28]" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* KPI METRICS RIBBON */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card-surface p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Configured</div>
          <div className="text-2xl font-black text-white mt-1">{events.length}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Events in system</div>
        </div>
        <div className="card-surface p-3.5 rounded-2xl border border-[#cedc28]/20 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-[#cedc28] uppercase tracking-widest flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#cedc28]" />
            <span>Public Active</span>
          </div>
          <div className="text-2xl font-black text-[#cedc28] mt-1">{publicActiveCount}</div>
          <div className="text-[10px] text-[#cedc28]/70 mt-0.5">Visible to all users</div>
        </div>
        <div className="card-surface p-3.5 rounded-2xl border border-purple-500/30 bg-purple-950/10 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest flex items-center gap-1">
            <Shield className="w-3 h-3 text-purple-400" />
            <span>Admin Testing</span>
          </div>
          <div className="text-2xl font-black text-purple-300 mt-1">{adminOnlyCount}</div>
          <div className="text-[10px] text-purple-400/80 mt-0.5">Admin-only preview</div>
        </div>
        <div className="card-surface p-3.5 rounded-2xl border border-[#14a6d9]/20 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest">Portfolios</div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-base font-black text-white">P1: <span className="text-[#14a6d9]">{p1Count}</span></span>
            <span className="text-base font-black text-white">P3: <span className="text-[#cedc28]">{p3Count}</span></span>
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">Categorization rules</div>
        </div>
        <div className="card-surface p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Version State</div>
          <div className="text-base font-black text-white mt-1 truncate">{config?.version || 'v1.0.0'}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {history[0] ? `Updated ${new Date(history[0].timestamp).toLocaleDateString()}` : 'Initial'}
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="card-surface p-4 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, GID, portfolio..."
            className="w-full bg-[#041628] border border-gray-600/40 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#eef7f5] placeholder-gray-500 focus:outline-none focus:border-[#cedc28]/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Portfolio Filter */}
          <div className="flex bg-[#041628] rounded-xl border border-gray-600/40 p-0.5 text-xs">
            {['ALL', 'P1', 'P3'].map(p => (
              <button
                key={p}
                onClick={() => setSelectedPortfolio(p)}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all ${
                  selectedPortfolio === p ? 'bg-[#cedc28] text-[#1a302e]' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex bg-[#041628] rounded-xl border border-gray-600/40 p-0.5 text-xs">
            {[
              { id: 'ALL', label: 'ALL' },
              { id: 'PUBLIC ACTIVE', label: 'PUBLIC' },
              { id: 'ADMIN ONLY', label: 'ADMIN ONLY' },
              { id: 'INACTIVE', label: 'OFF' }
            ].map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStatus(s.id)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                  selectedStatus === s.id 
                    ? s.id === 'ADMIN ONLY' 
                      ? 'bg-purple-600 text-white shadow-sm'
                      : s.id === 'PUBLIC ACTIVE' 
                      ? 'bg-[#cedc28] text-[#1a302e]' 
                      : s.id === 'INACTIVE'
                      ? 'bg-gray-700 text-white'
                      : 'bg-[#14a6d9] text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* EVENTS TABLE */}
      <div className="card-surface rounded-2xl border border-white/5 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#0a2442]/80 border-b border-gray-700/50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <th className="py-3 px-4">Status & Access</th>
                <th className="py-3 px-4">Event Name & Details</th>
                <th className="py-3 px-4">Portfolio</th>
                <th className="py-3 px-4">Sheet GID (Actuals)</th>
                <th className="py-3 px-4">Planned GID</th>
                <th className="py-3 px-4">Date Range Filter</th>
                <th className="py-3 px-4">Launch Date (W0)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {filteredEvents.map(event => {
                const isAdminOnly = (event.status === 'admin_only' || event.visibility === 'admin_only') && event.enabled && event.status !== 'inactive';
                const isPublic = event.enabled && event.status !== 'inactive' && !isAdminOnly;
                const isOff = !event.enabled || event.status === 'inactive';

                return (
                <tr 
                  key={event.id}
                  className={`hover:bg-white/[0.02] transition-colors ${isOff ? 'opacity-50' : ''}`}
                >
                  {/* Status Toggle & 3-Tier Badge */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isAdminOnly ? (
                      <button
                        onClick={() => handleCycleStatus(event)}
                        title="Click to cycle: Admin Only -> Inactive -> Public Active"
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30"
                      >
                        <Shield className="w-3 h-3 text-purple-400" />
                        <span>ADMIN ONLY</span>
                      </button>
                    ) : isPublic ? (
                      <button
                        onClick={() => handleCycleStatus(event)}
                        title="Click to cycle: Public Active -> Admin Only -> Inactive"
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all bg-[#cedc28]/20 text-[#cedc28] border border-[#cedc28]/40 hover:bg-[#cedc28]/30"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#cedc28]"></span>
                        <span>PUBLIC ACTIVE</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCycleStatus(event)}
                        title="Click to cycle: Inactive -> Public Active -> Admin Only"
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                        <span>OFF</span>
                      </button>
                    )}
                  </td>

                  {/* Event Name & Type */}
                  <td 
                    className="py-3.5 px-4 cursor-pointer group"
                    onClick={() => openEditModal(event)}
                    title="Click to edit complete configuration for this event"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm group-hover:text-[#cedc28] group-hover:underline transition-colors flex items-center gap-1.5">
                        {event.name}
                        <Edit3 className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#cedc28] transition-colors" />
                      </span>
                      {isAdminOnly && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-500/25 text-purple-300 border border-purple-500/40 inline-flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5 text-purple-400" />
                          ADMIN PREVIEW
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2">
                      <span>Source: <code className="text-[#14a6d9]">{event.sourceName || event.name}</code></span>
                      <span>•</span>
                      <span>{event.eventType || 'Exhibition'}</span>
                      {event.channelFilters && (
                        <>
                          <span>•</span>
                          <span className="text-gray-500">
                            {Object.entries(event.channelFilters).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(' | ')}
                          </span>
                        </>
                      )}
                    </div>
                  </td>

                  {/* Portfolio */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] ${
                      event.portfolio === 'P3' 
                        ? 'bg-[#cedc28]/20 text-[#cedc28] border border-[#cedc28]/30' 
                        : 'bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/30'
                    }`}>
                      {event.portfolio || 'P1'}
                    </span>
                  </td>

                  {/* Sheet GID */}
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono text-gray-300">
                    {event.gid ? (
                      <span className="bg-[#041628] px-2 py-1 rounded border border-gray-700/60 text-[11px]">
                        gid={event.gid}
                      </span>
                    ) : (
                      <span className="text-gray-500 italic text-[11px]">Default Root Sheet</span>
                    )}
                  </td>

                  {/* Planned GID */}
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono text-gray-300">
                    {event.plannedGid ? (
                      <span className="bg-[#041628] px-2 py-1 rounded border border-gray-700/60 text-[11px]">
                        gid={event.plannedGid}
                      </span>
                    ) : (
                      <span className="text-amber-400/70 text-[10px] font-sans font-medium">Pending Sheet</span>
                    )}
                  </td>

                  {/* Date Range Filter */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <button
                      onClick={() => openDateModal(event)}
                      className="group flex items-center gap-1.5 px-2.5 py-1 bg-[#041628] hover:bg-[#0a2442] border border-gray-700/50 hover:border-[#14a6d9]/50 rounded-lg text-left transition-all"
                    >
                      <Calendar className="w-3 h-3 text-[#14a6d9]" />
                      <span className="text-[11px] text-gray-300 group-hover:text-white">
                        {event.startDate || event.endDate ? (
                          `${event.startDate || 'Start'} → ${event.endDate || 'Present'}`
                        ) : (
                          'All Dates'
                        )}
                      </span>
                      <Edit2 className="w-2.5 h-2.5 text-gray-500 group-hover:text-[#14a6d9] ml-1" />
                    </button>
                  </td>

                  {/* Launch Date */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-gray-300">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Clock className="w-3 h-3 text-gray-500" />
                      <span>{event.launchDate || '2026-12-01'}</span>
                    </div>
                    {event.autoPublishDate && (
                      <div className="text-[10px] text-amber-400 mt-1 flex items-center gap-1 font-medium">
                        <Calendar className="w-2.5 h-2.5" />
                        <span>Auto-live: {event.autoPublishDate}</span>
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isAdminOnly && (
                        <button
                          onClick={() => setConfirmPromoteEvent(event)}
                          title="Promote to Public Active (publish to all users)"
                          className="px-2.5 py-1 bg-[#cedc28]/20 hover:bg-[#cedc28] text-[#cedc28] hover:text-[#1a302e] border border-[#cedc28]/50 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm"
                        >
                          <span>🚀 Go Live</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDuplicateEvent(event)}
                        title="Duplicate as template"
                        className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditModal(event)}
                        title="Edit complete event configuration"
                        className="px-2.5 py-1 bg-[#14a6d9]/15 hover:bg-[#14a6d9] text-[#14a6d9] hover:text-white border border-[#14a6d9]/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteEvent(event)}
                        title="Delete event"
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    No events match your current search and filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT COMPLETE EVENT CONFIGURATION */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-surface max-w-3xl w-full rounded-3xl border border-[#cedc28]/30 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                    {isAddingNew ? 'Add New Event' : `Edit Configuration: ${editingEvent.name || 'Event'}`}
                  </h3>
                  {editingEvent.id && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#041628] text-gray-400 border border-gray-700">
                      id: {editingEvent.id}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#14a6d9] mt-0.5">
                  {isAddingNew 
                    ? 'Define complete parameters for a new event' 
                    : 'Modify complete parameters, sheet GIDs, dates, channels, and rules'}
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                {/* View Switcher: Visual Form vs Raw JSON */}
                <div className="flex bg-[#041628] rounded-xl border border-gray-700 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSwitchTab('form')}
                    className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                      modalTab === 'form' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Form View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchTab('json')}
                    className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                      modalTab === 'json' ? 'bg-[#14a6d9] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Raw JSON</span>
                  </button>
                </div>

                <button 
                  onClick={() => { setEditingEvent(null); setOriginalEventId(null); }}
                  className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveEvent} className="flex-1 flex flex-col overflow-hidden">
              {/* TAB 1: VISUAL FORM VIEW */}
              {modalTab === 'form' && (
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                  {/* SECTION 1: CORE IDENTIFICATION */}
                  <div>
                    <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#cedc28]"></span>
                      <span>1. Core Event Identification & Portfolio</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Event Display Name */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Event Display Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={editingEvent.name || ''}
                          onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                          placeholder="e.g. SMLC 26"
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                      </div>

                      {/* Event Unique ID / Slug */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          System ID / Slug *
                        </label>
                        <input
                          type="text"
                          value={editingEvent.id || ''}
                          onChange={(e) => setEditingEvent({ ...editingEvent, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                          placeholder="e.g. smlc-26"
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                        <span className="text-[9px] text-gray-500 mt-0.5 block">
                          Unique URL identifier (auto-derived from name if blank).
                        </span>
                      </div>

                      {/* Source Name in Sheet */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Source Name in DB / Sheet
                        </label>
                        <input
                          type="text"
                          value={editingEvent.sourceName || ''}
                          onChange={(e) => setEditingEvent({ ...editingEvent, sourceName: e.target.value })}
                          placeholder="e.g. SMLC"
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                        <span className="text-[9px] text-gray-500 mt-0.5 block">
                          Tag matching rows in the "Event Name DB" column.
                        </span>
                      </div>

                      {/* Portfolio */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Portfolio Assignment *
                        </label>
                        <select
                          value={editingEvent.portfolio || 'P1'}
                          onChange={(e) => setEditingEvent({ ...editingEvent, portfolio: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white font-bold focus:outline-none focus:border-[#cedc28]/60"
                        >
                          <option value="P1">Portfolio P1 (GSTS, SAIF, KoG, Black Hat)</option>
                          <option value="P3">Portfolio P3 (SMLC, IDWS, BIO, CPHI)</option>
                          <option value="P2">Portfolio P2</option>
                        </select>
                      </div>

                      {/* Event Type */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Event Classification Type
                        </label>
                        <select
                          value={editingEvent.eventType || 'Exhibition'}
                          onChange={(e) => setEditingEvent({ ...editingEvent, eventType: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        >
                          <option value="Exhibition">Exhibition</option>
                          <option value="Conference">Conference</option>
                          <option value="Both">Both (Exhibition & Conference)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: GOOGLE SHEETS & DATA INGESTION */}
                  <div className="pt-2 border-t border-gray-700/40">
                    <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#14a6d9]"></span>
                      <span>2. Google Sheets & Data Connection</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Actuals Sheet GID */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                            Actuals Sheet GID
                          </label>
                          <button
                            type="button"
                            onClick={handleValidateSheet}
                            disabled={validatingSheet}
                            className="text-[10px] font-bold text-[#14a6d9] hover:text-[#cedc28] flex items-center gap-1 transition-colors"
                            title="Test connection to Google Sheets and inspect column headers"
                          >
                            <RefreshCw className={`w-3 h-3 ${validatingSheet ? 'animate-spin text-[#cedc28]' : ''}`} />
                            <span>{validatingSheet ? 'Testing...' : 'Test Connection'}</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={editingEvent.gid || ''}
                          onChange={(e) => {
                            setEditingEvent({ ...editingEvent, gid: e.target.value });
                            setSheetValidationResult(null);
                          }}
                          placeholder="Leave empty for root sheet, or enter GID"
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                        {sheetValidationResult && (
                          <div className={`mt-2 p-2.5 rounded-xl text-xs border ${
                            sheetValidationResult.valid 
                              ? 'bg-[#cedc28]/10 border-[#cedc28]/40 text-gray-200' 
                              : 'bg-red-500/10 border-red-500/40 text-red-300'
                          }`}>
                            {sheetValidationResult.valid ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 font-bold text-[#cedc28]">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Connected: {sheetValidationResult.rowCount?.toLocaleString()} rows detected</span>
                                </div>
                                <div className="text-[10px] text-gray-300 flex flex-wrap gap-x-3 gap-y-0.5">
                                  <span>Spend: <strong className={sheetValidationResult.hasSpend ? 'text-lime-400' : 'text-amber-400'}>{sheetValidationResult.hasSpend ? '✓ Found' : '⚠ Missing'}</strong></span>
                                  <span>Date: <strong className={sheetValidationResult.hasDate ? 'text-lime-400' : 'text-amber-400'}>{sheetValidationResult.hasDate ? '✓ Found' : '⚠ Missing'}</strong></span>
                                  <span>Clicks: <strong className={sheetValidationResult.hasClicks ? 'text-lime-400' : 'text-amber-400'}>{sheetValidationResult.hasClicks ? '✓ Found' : '⚠ Missing'}</strong></span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                <span>{sheetValidationResult.error || 'Connection failed'}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Sheet Type */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Sheet Architecture Type
                        </label>
                        <select
                          value={editingEvent.sheetType || 'combined'}
                          onChange={(e) => setEditingEvent({ ...editingEvent, sheetType: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        >
                          <option value="combined">Combined Country CSV (Default Central Warehouse)</option>
                          <option value="standalone">Standalone Dedicated Sheet</option>
                        </select>
                      </div>

                      {/* Planned Sheet GID */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Planned Spends Sheet GID (Optional)
                        </label>
                        <input
                          type="text"
                          value={editingEvent.plannedGid || ''}
                          onChange={(e) => setEditingEvent({ ...editingEvent, plannedGid: e.target.value })}
                          placeholder="e.g. 2019892532"
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                      </div>

                      {/* Planned Sheet Type */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Planned Sheet Parser Format
                        </label>
                        <select
                          value={editingEvent.plannedType || 'standard'}
                          onChange={(e) => setEditingEvent({ ...editingEvent, plannedType: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        >
                          <option value="standard">Standard (Standard Planned Spends Table)</option>
                          <option value="blackhat-text">Black Hat Text (Special Custom Header)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 3: DATES & CAMPAIGN TIMELINE */}
                  <div className="pt-2 border-t border-gray-700/40">
                    <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                      <span>3. Dates & Campaign Timeline</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Launch Date for Dynamic Week Countdown */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Event Launch Date (For W0 Countdown) *
                        </label>
                        <input
                          type="date"
                          required
                          value={editingEvent.launchDate || '2026-12-01'}
                          onChange={(e) => setEditingEvent({ ...editingEvent, launchDate: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                        <span className="text-[9px] text-gray-500 mt-0.5 block">
                          Determines W0 and relative week calculations (e.g. W-12).
                        </span>
                      </div>

                      {/* Date Filter Mode */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Date Filter Ingestion Mode
                        </label>
                        <select
                          value={editingEvent.dateFilterMode || 'none'}
                          onChange={(e) => setEditingEvent({ ...editingEvent, dateFilterMode: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        >
                          <option value="none">None (All Available Data in Sheet)</option>
                          <option value="min-date">Min-Date (From Start Date Onwards)</option>
                          <option value="year-2026">Full Year 2026 Calendar</option>
                          <option value="strict">Strict (Between Start Date & End Date)</option>
                        </select>
                      </div>

                      {/* Date Filter: Start Date */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Date Filter: Start Date (Inclusive)
                        </label>
                        <input
                          type="date"
                          value={editingEvent.startDate || ''}
                          onChange={(e) => setEditingEvent({ ...editingEvent, startDate: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                      </div>

                      {/* Date Filter: End Date */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Date Filter: End Date (Inclusive)
                        </label>
                        <input
                          type="date"
                          value={editingEvent.endDate || ''}
                          onChange={(e) => setEditingEvent({ ...editingEvent, endDate: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                      </div>

                      {/* Auto-Publish Go-Live Date */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                          Auto-Publish Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={editingEvent.autoPublishDate || ''}
                          onChange={(e) => setEditingEvent({ ...editingEvent, autoPublishDate: e.target.value })}
                          className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#cedc28]/60"
                        />
                        <span className="text-[9px] text-gray-400 mt-0.5 block">
                          Automatically promotes from Admin Testing to Public Active on this date.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 4: MARKETING CHANNELS (INGESTION FILTERS) */}
                  <div className="pt-2 border-t border-gray-700/40">
                    <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>4. Marketing Channels Ingestion</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-normal">
                        Toggle to include or exclude specific channels for this event
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {[
                        { key: 'meta', label: 'Meta Ads', desc: 'FB & IG' },
                        { key: 'google', label: 'Google Ads', desc: 'Search & PMax' },
                        { key: 'linkedin', label: 'LinkedIn', desc: 'InMail & Feed' },
                        { key: 'tiktok', label: 'TikTok', desc: 'Video Ads' },
                        { key: 'x', label: 'X (Twitter)', desc: 'Promoted' }
                      ].map(ch => {
                        const isEnabled = editingEvent.channelFilters ? editingEvent.channelFilters[ch.key] !== false : true;
                        return (
                          <button
                            key={ch.key}
                            type="button"
                            onClick={() => {
                              const currentChannels = editingEvent.channelFilters || {
                                meta: true, google: true, linkedin: true, tiktok: true, x: true
                              };
                              setEditingEvent({
                                ...editingEvent,
                                channelFilters: {
                                  ...currentChannels,
                                  [ch.key]: !isEnabled
                                }
                              });
                            }}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              isEnabled
                                ? 'bg-emerald-950/20 border-emerald-500/50 text-white shadow-sm'
                                : 'bg-[#041628]/60 border-gray-700/50 text-gray-500'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs font-bold ${isEnabled ? 'text-emerald-400' : 'text-gray-400'}`}>
                                {ch.label}
                              </span>
                              <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                                isEnabled ? 'bg-emerald-500 text-black' : 'bg-gray-800 text-gray-500 border border-gray-700'
                              }`}>
                                {isEnabled ? '✓' : '✕'}
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-400 block">{ch.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* SECTION 5: ADVANCED COLUMN / ALIAS MAPPINGS */}
                  <div className="pt-2 border-t border-gray-700/40">
                    <div className="p-3.5 bg-[#041628]/80 rounded-xl border border-gray-700/60">
                      <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5 text-[#14a6d9]" />
                        <span>5. Custom Column Mappings (Self-Service Aliases)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 block mb-1">Spend Column Override</label>
                          <input
                            type="text"
                            value={editingEvent.fieldAliases?.spend || ''}
                            onChange={(e) => setEditingEvent({
                              ...editingEvent,
                              fieldAliases: { ...(editingEvent.fieldAliases || {}), spend: e.target.value }
                            })}
                            placeholder="Default (Spend / Cost)"
                            className="w-full bg-[#0a2442] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 block mb-1">Date Column Override</label>
                          <input
                            type="text"
                            value={editingEvent.fieldAliases?.date || ''}
                            onChange={(e) => setEditingEvent({
                              ...editingEvent,
                              fieldAliases: { ...(editingEvent.fieldAliases || {}), date: e.target.value }
                            })}
                            placeholder="Default (Date / Day)"
                            className="w-full bg-[#0a2442] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 block mb-1">Event Column Override</label>
                          <input
                            type="text"
                            value={editingEvent.fieldAliases?.event || ''}
                            onChange={(e) => setEditingEvent({
                              ...editingEvent,
                              fieldAliases: { ...(editingEvent.fieldAliases || {}), event: e.target.value }
                            })}
                            placeholder="Default (Event Name DB)"
                            className="w-full bg-[#0a2442] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 6: EVENT VISIBILITY & TESTING TIER */}
                  <div className="pt-2 border-t border-gray-700/40">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">
                      6. Visibility & Access Tier *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Option 1: Admin Only (Testing) */}
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ 
                          ...editingEvent, 
                          status: 'admin_only', 
                          visibility: 'admin_only', 
                          enabled: true 
                        })}
                        className={`p-3 rounded-2xl border text-left transition-all relative ${
                          (editingEvent.status === 'admin_only' || editingEvent.visibility === 'admin_only')
                            ? 'bg-purple-950/40 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.25)]'
                            : 'bg-[#041628] border-gray-700/60 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-purple-300">
                            <Shield className="w-3.5 h-3.5 text-purple-400" />
                            <span>Admin Only</span>
                          </div>
                          {(editingEvent.status === 'admin_only' || editingEvent.visibility === 'admin_only') && (
                            <Check className="w-3.5 h-3.5 text-purple-400" />
                          )}
                        </div>
                        <div className="text-[10px] leading-relaxed text-gray-300">
                          Isolated staging. Only admins can see & test this event in the live dashboard.
                        </div>
                        <div className="mt-2 inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Recommended for new
                        </div>
                      </button>

                      {/* Option 2: Public Active */}
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ 
                          ...editingEvent, 
                          status: 'active', 
                          visibility: 'public', 
                          enabled: true 
                        })}
                        className={`p-3 rounded-2xl border text-left transition-all relative ${
                          (editingEvent.status === 'active' || (!editingEvent.status && editingEvent.enabled && editingEvent.visibility !== 'admin_only'))
                            ? 'bg-[#cedc28]/10 border-[#cedc28] text-white shadow-[0_0_15px_rgba(206,220,40,0.2)]'
                            : 'bg-[#041628] border-gray-700/60 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-[#cedc28]">
                            <Eye className="w-3.5 h-3.5 text-[#cedc28]" />
                            <span>Public Active</span>
                          </div>
                          {(editingEvent.status === 'active' || (!editingEvent.status && editingEvent.enabled && editingEvent.visibility !== 'admin_only')) && (
                            <Check className="w-3.5 h-3.5 text-[#cedc28]" />
                          )}
                        </div>
                        <div className="text-[10px] leading-relaxed text-gray-300">
                          Live production. Ingested and visible to all authorized dashboard users.
                        </div>
                      </button>

                      {/* Option 3: Inactive (Off) */}
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ 
                          ...editingEvent, 
                          status: 'inactive', 
                          visibility: 'public', 
                          enabled: false 
                        })}
                        className={`p-3 rounded-2xl border text-left transition-all relative ${
                          editingEvent.status === 'inactive' || editingEvent.enabled === false
                            ? 'bg-gray-800/80 border-gray-500 text-white'
                            : 'bg-[#041628] border-gray-700/60 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-gray-300">
                            <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                            <span>Inactive (Off)</span>
                          </div>
                          {(editingEvent.status === 'inactive' || editingEvent.enabled === false) && (
                            <Check className="w-3.5 h-3.5 text-gray-300" />
                          )}
                        </div>
                        <div className="text-[10px] leading-relaxed text-gray-400">
                          Completely disabled. Data is not ingested for any user.
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* SECTION 7: NOTES & DESCRIPTION */}
                  <div className="pt-2 border-t border-gray-700/40">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                      7. Notes & Operational Nuances
                    </label>
                    <textarea
                      rows={2}
                      value={editingEvent.description || ''}
                      onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                      placeholder="Optional details about this event or specific campaign nuances"
                      className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#cedc28]/60"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: RAW JSON CONFIG VIEW */}
              {modalTab === 'json' && (
                <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Code className="w-4 h-4 text-[#14a6d9]" />
                        Direct JSON Event Configuration Editor
                      </span>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Inspect or modify every configuration key directly. Saving persists this exact object.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(jsonConfigText);
                          setJsonConfigText(JSON.stringify(parsed, null, 2));
                          setJsonConfigError(null);
                          showNotification('JSON formatted successfully');
                        } catch (err) {
                          setJsonConfigError(`Format error: ${err.message}`);
                        }
                      }}
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-[10px] font-bold border border-gray-700 transition-colors"
                    >
                      Format JSON
                    </button>
                  </div>

                  {jsonConfigError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span>{jsonConfigError}</span>
                    </div>
                  )}

                  <textarea
                    rows={18}
                    value={jsonConfigText}
                    onChange={(e) => {
                      setJsonConfigText(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setEditingEvent(parsed);
                        setJsonConfigError(null);
                      } catch (err) {
                        setJsonConfigError(err.message);
                      }
                    }}
                    className="w-full bg-[#020b14] border border-gray-700 rounded-2xl p-4 font-mono text-xs text-lime-400 focus:outline-none focus:border-[#14a6d9] leading-relaxed"
                    spellCheck={false}
                  />
                </div>
              )}

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-700/50 flex items-center justify-between bg-[#041628]/40">
                <span className="text-[10px] text-gray-400 font-mono">
                  {modalTab === 'form' ? 'Visual Form Mode' : 'Raw JSON Mode'}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditingEvent(null); setOriginalEventId(null); }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-[#cedc28] hover:bg-[#cedc28]/90 text-[#1a302e] rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-lg disabled:opacity-50 flex items-center gap-2 transition-all"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: QUICK DATE RANGE */}
      {dateModalEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-surface max-w-md w-full rounded-3xl border border-[#14a6d9]/40 shadow-2xl p-6">
            <h3 className="text-base font-bold text-white uppercase tracking-wider mb-1">
              Adjust Date Range
            </h3>
            <p className="text-xs text-[#14a6d9] mb-4">
              Filtering data fetch for <span className="font-bold text-white">{dateModalEvent.name}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                  Start Date (Inclusive)
                </label>
                <input
                  type="date"
                  value={quickStartDate}
                  onChange={(e) => setQuickStartDate(e.target.value)}
                  className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#14a6d9]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                  End Date (Inclusive)
                </label>
                <input
                  type="date"
                  value={quickEndDate}
                  onChange={(e) => setQuickEndDate(e.target.value)}
                  className="w-full bg-[#041628] border border-gray-600/50 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#14a6d9]"
                />
              </div>

              {/* Quick Presets */}
              <div className="pt-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
                  Quick Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setQuickStartDate(''); setQuickEndDate(''); }}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-gray-300"
                  >
                    All Available
                  </button>
                  <button
                    type="button"
                    onClick={() => { setQuickStartDate('2026-06-01'); setQuickEndDate(''); }}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-gray-300"
                  >
                    From June 1, 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => { setQuickStartDate('2026-01-01'); setQuickEndDate('2026-12-31'); }}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-gray-300"
                  >
                    Full 2026 Year
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-gray-700/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const ev = dateModalEvent;
                  setDateModalEvent(null);
                  openEditModal(ev);
                }}
                className="text-xs font-bold text-[#cedc28] hover:underline flex items-center gap-1.5 transition-all"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Edit Full Event Config (All Fields) →</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setDateModalEvent(null)}
                  className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuickDate}
                  disabled={saving}
                  className="px-4 py-1.5 bg-[#14a6d9] hover:bg-[#14a6d9]/90 text-white rounded-xl text-xs font-bold uppercase shadow-lg flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Updating...' : 'Apply Date Range'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: VERSION HISTORY & ROLLBACK */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-surface max-w-3xl w-full rounded-3xl border border-[#14a6d9]/40 shadow-2xl p-6 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-700/50">
              <div>
                <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <History className="w-5 h-5 text-[#14a6d9]" />
                  Configuration Version Control & Audit Trail
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Instant rollback and audit history of all dashboard modifications
                </p>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Admin Banner */}
            <div className="bg-[#0a2442]/80 border border-[#14a6d9]/30 rounded-2xl p-3.5 my-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-gray-300 font-medium">Active Admin Operator:</span>
                <span className="font-bold text-white flex items-center gap-1.5 bg-[#14a6d9]/25 px-2.5 py-0.5 rounded-full border border-[#14a6d9]/40 text-xs">
                  <User className="w-3.5 h-3.5 text-[#14a6d9]" />
                  {currentAuthor}
                </span>
              </div>
              <span className="text-[11px] text-[#14a6d9] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#cedc28]" />
                All changes create an immutable version with 1-click restore
              </span>
            </div>

            <div className="py-2 space-y-3 overflow-y-auto custom-scrollbar flex-1 pr-1">
              {history.map((ver, idx) => (
                <div
                  key={ver.versionId || idx}
                  className={`p-4 rounded-2xl border transition-all ${
                    idx === 0 
                      ? 'bg-[#14a6d9]/10 border-[#14a6d9]/40 shadow-lg shadow-cyan-950/20' 
                      : 'bg-[#041628] border-gray-700/40 hover:border-gray-600'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                        idx === 0 ? 'bg-[#14a6d9] text-white shadow-sm' : 'bg-gray-800 text-gray-300'
                      }`}>
                        {ver.versionId}
                      </span>
                      {idx === 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#cedc28] bg-[#cedc28]/15 px-2 py-0.5 rounded-full border border-[#cedc28]/30">
                          CURRENT ACTIVE
                        </span>
                      )}
                      {renderActionBadge(ver)}
                    </div>
                    <span className="text-[11px] text-gray-400 font-medium">
                      {new Date(ver.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-sm font-semibold text-white mt-2">
                    {ver.description}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-gray-700/40 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Admin Attribution Badge */}
                      <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>Admin: <strong className="text-white font-mono">{ver.author || 'admin@tahaluf.com'}</strong></span>
                      </span>

                      {/* Snapshot Inspector Toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedVersionId(expandedVersionId === ver.versionId ? null : ver.versionId)}
                        className="px-2.5 py-1 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-gray-700/50"
                        title="Inspect snapshot events"
                      >
                        <Layers className="w-3.5 h-3.5 text-[#14a6d9]" />
                        <span>{ver.eventsCount} events</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedVersionId === ver.versionId ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {idx !== 0 && (
                      <button
                        onClick={() => handleRevertVersion(ver.versionId, ver.description)}
                        disabled={saving}
                        className="px-4 py-1.5 bg-[#14a6d9] hover:bg-[#14a6d9]/80 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md hover:shadow-[#14a6d9]/30 active:scale-95 cursor-pointer disabled:opacity-50"
                        title="1-Click restore all events and settings back to this snapshot"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                        1-Click Restore
                      </button>
                    )}
                  </div>

                  {/* Collapsible Snapshot Details */}
                  {expandedVersionId === ver.versionId && ver.snapshot?.events && (
                    <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2 text-xs bg-black/20 p-3 rounded-xl border border-gray-800">
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Events Snapshot ({ver.snapshot.events.length}):</span>
                        <span className="text-[10px] text-[#14a6d9]">Recorded at {new Date(ver.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {ver.snapshot.events.map(ev => (
                          <div key={ev.id} className="bg-black/40 border border-gray-700/60 rounded-xl p-2.5 flex flex-col justify-between text-xs">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-bold text-white truncate">{ev.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-gray-800 text-gray-300">{ev.portfolio}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-gray-400">
                              <span>{ev.gid ? `GID: ${ev.gid}` : 'Root sheet'}</span>
                              <span className={`font-bold uppercase px-1.5 py-0.5 rounded text-[9px] ${
                                ev.status === 'admin_only' || ev.visibility === 'admin_only' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                                ev.enabled && ev.status !== 'inactive' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                                'bg-gray-700 text-gray-400'
                              }`}>
                                {ev.status === 'admin_only' || ev.visibility === 'admin_only' ? 'Admin Only' : ev.enabled && ev.status !== 'inactive' ? 'Live Active' : 'Off'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-700/50 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRM DELETE */}
      {confirmDeleteEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-surface max-w-sm w-full rounded-3xl border border-red-500/40 shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Remove Event?</h3>
            <p className="text-xs text-gray-400 mb-5">
              Are you sure you want to remove <strong className="text-white">"{confirmDeleteEvent.name}"</strong>? 
              A version snapshot will be created and this can be undone at any time.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteEvent(null)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteEvent(confirmDeleteEvent.id, confirmDeleteEvent.name)}
                disabled={saving}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CONFIRM RESET */}
      {confirmResetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-surface max-w-sm w-full rounded-3xl border border-red-500/40 shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Reset to Factory Defaults?</h3>
            <p className="text-xs text-gray-400 mb-5">
              This will restore the original configuration of all 8 Tahaluf events (GSTS, SAIF, KoG, Black Hat, SMLC, IDWS, BIO, CPHI).
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmResetModal(false)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDefaults}
                disabled={saving}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase"
              >
                {saving ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CONFIRM PROMOTE TO LIVE */}
      {confirmPromoteEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-surface max-w-sm w-full rounded-3xl border border-[#cedc28]/40 shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[#cedc28]/20 text-[#cedc28] flex items-center justify-center mx-auto mb-3">
              <Eye className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Promote to Public Active?</h3>
            <p className="text-xs text-gray-300 mb-5 leading-relaxed">
              Are you sure you want to promote <strong className="text-white">"{confirmPromoteEvent.name}"</strong>? 
              It will immediately become visible to all standard users in Portfolio <strong className="text-[#cedc28]">{confirmPromoteEvent.portfolio || 'P1'}</strong>. A version snapshot will be created automatically.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmPromoteEvent(null)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePromoteEvent(confirmPromoteEvent)}
                disabled={saving}
                className="flex-1 py-2 bg-[#cedc28] hover:bg-[#cedc28]/90 text-[#1a302e] rounded-xl text-xs font-extrabold uppercase shadow-lg"
              >
                {saving ? 'Promoting...' : '🚀 Publish Live'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
