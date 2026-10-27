"use client";

import React, { useEffect, useRef, useState } from 'react';

export function AdminDialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="admin-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="w-full max-w-md rounded-xl border border-slate-600 bg-[#071b2e] p-6 text-white shadow-xl backdrop:bg-black/70">
      <h2 id="admin-dialog-title" className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </dialog>
  );
}

export function AdminTabs({ tabs, value, onChange, label = 'Page sections' }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
      {tabs.map(tab => (
        <button key={tab.id} type="button" aria-current={value === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${value === tab.id ? 'bg-[#cedc28] text-[#041628]' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function useAdminView(key, initial, allowed) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const restore = () => {
      const saved = new URLSearchParams(window.location.search).get(key);
      setValue(allowed.includes(saved) ? saved : initial);
    };
    restore();
    window.addEventListener('popstate', restore);
    window.addEventListener('admin-locationchange', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('admin-locationchange', restore);
    };
  // The allowed values are a fixed list owned by each page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, initial]);
  const update = next => {
    if (!allowed.includes(next)) return;
    setValue(next);
    const url = new URL(window.location.href);
    url.searchParams.set(key, next);
    window.history.replaceState(null, '', url);
  };
  return [value, update];
}

export function useAdminDirtyGuard(scope, dirty) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('admin-dirty', { detail: { scope, dirty } }));
    const warn = event => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.dispatchEvent(new CustomEvent('admin-dirty', { detail: { scope, dirty: false } }));
    };
  }, [scope, dirty]);
}
