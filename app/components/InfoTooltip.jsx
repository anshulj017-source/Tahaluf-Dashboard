"use client";
import React, { useRef } from 'react';
import { Info, X } from 'lucide-react';

export default function InfoTooltip({ definition }) {
  const dialogRef = useRef(null);

  const openDialog = (e) => {
    e.stopPropagation();
    if (dialogRef.current) {
      dialogRef.current.showModal();
    }
  };

  const closeDialog = (e) => {
    e.stopPropagation();
    if (dialogRef.current) {
      dialogRef.current.close();
    }
  };

  if (!definition) return null;

  return (
    <>
      <button 
        onClick={openDialog}
        className="text-[#6fa89f] hover:text-white transition-colors focus:outline-none flex-shrink-0"
        title="View Definition"
      >
        <Info size={14} />
      </button>

      <dialog 
        ref={dialogRef}
        className="bg-[#011414] border border-[#c88214]/40 rounded-2xl p-6 text-white max-w-sm w-[90vw] shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm m-auto focus:outline-none"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog(e);
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-2 text-[#c88214] font-black tracking-widest uppercase text-sm">
              <Info size={16} />
              <span>Metric Definition</span>
            </div>
            <button onClick={closeDialog} className="text-gray-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-[#eef7f5]/80 leading-relaxed font-medium">
            {definition}
          </p>
        </div>
      </dialog>
    </>
  );
}
