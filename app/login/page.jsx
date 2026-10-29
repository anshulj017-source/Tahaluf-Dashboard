"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../../lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let resolved = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      resolved = true;
      if (user) {
        router.push('/');
      } else {
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('tahaluf_cached_role');
            localStorage.removeItem('tahaluf_cached_email');
            localStorage.removeItem('tahaluf_feature_modes_draft');
          } catch {}
        }
        setLoading(false);
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        if (auth.currentUser) {
          router.push('/');
        } else {
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('tahaluf_cached_role');
              localStorage.removeItem('tahaluf_cached_email');
              localStorage.removeItem('tahaluf_feature_modes_draft');
            } catch {}
          }
          setLoading(false);
        }
      }
    }, 2500);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('tahaluf_cached_role');
          localStorage.removeItem('tahaluf_cached_email');
          localStorage.removeItem('tahaluf_feature_modes_draft');
        } catch {}
      }
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err) {
      console.error(err);
      setError('Invalid email or password.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex flex-col items-center justify-center text-white p-4 relative overflow-hidden select-none">
        <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none opacity-30"></div>
        <div className="relative flex items-center justify-center w-32 h-32 mb-6">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#cedc28]/25 to-[#14a6d9]/25 blur-xl animate-pulse-ring"></div>
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#cedc28]/40 animate-spin-slow"></div>
          <div className="relative z-10 w-20 h-20 rounded-full bg-[#0a2442] border border-[#cedc28]/35 flex items-center justify-center p-3.5 shadow-[0_0_20px_rgba(206,220,40,0.3)] animate-float-subtle">
            <img src="/tahaluf-logo.svg" alt="Tahaluf" className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
          </div>
        </div>
        <span className="text-xs font-bold text-[#cedc28] tracking-[0.2em] uppercase mb-2">Connecting to Gateway</span>
        <div className="w-40 bg-[#0a2442] h-1.5 rounded-full overflow-hidden border border-[#cedc28]/25 p-0.5 relative shadow-inner">
          <div className="h-full bg-gradient-to-r from-[#14a6d9] to-[#cedc28] rounded-full w-2/3 animate-shimmer-flow"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center app-bg p-4 font-sans relative overflow-hidden text-white">
      {/* Background Graphic */}
      <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none"></div>

      <div className="card-surface rounded-3xl p-10 max-w-md w-full shadow-2xl border border-[#cedc28]/20 relative z-10">
        <div className="flex flex-col items-center mb-10">
          <img 
            src="/tahaluf-logo.svg" 
            alt="Tahaluf Logo" 
            className="h-16 object-contain mb-6" 
            onError={(e) => e.target.style.display = 'none'}
          />
          <h1 className="text-xl font-anton uppercase text-white text-center tracking-tight uppercase">Event Performance Dashboard</h1>
          <p className="text-[10px] text-[#cedc28] font-bold mt-2 uppercase tracking-[0.2em]">Authorized Access Only</p>
        </div>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm font-medium mb-6 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          <div>
            <label className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-2 block">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full surface-inset border border-[#cedc28]/30 rounded-xl px-4 py-3 text-sm text-[#eef7f5] focus:outline-none focus:border-[#cedc28] transition-all duration-200"
              placeholder="name@example.com"
              required 
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-2 block">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full surface-inset border border-[#cedc28]/30 rounded-xl px-4 py-3 text-sm text-[#eef7f5] focus:outline-none focus:border-[#cedc28] transition-all duration-200"
              placeholder="••••••••"
              required 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#cedc28] hover:brightness-110 text-[#1a302e] rounded-xl py-3.5 text-xs font-bold uppercase tracking-widest transition-all mt-4 disabled:opacity-100"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
