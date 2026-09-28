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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/');
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
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
      <div className="min-h-screen app-bg flex flex-col items-center justify-center text-[#c88214] font-black text-2xl tracking-widest animate-pulse gap-6">
        <img src="/loc-logo/Saudi 2027-07.png" alt="Loading Logo" className="h-32 object-contain" onError={(e) => e.target.style.display = 'none'} />
        <span>AUTHENTICATING...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center app-bg p-4 font-sans relative overflow-hidden text-white">
      {/* Background Graphic */}
      <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none"></div>

      <div className="card-surface rounded-3xl p-10 max-w-md w-full shadow-2xl border border-[#c88214]/20 relative z-10">
        <div className="flex flex-col items-center mb-10">
          <img 
            src="/loc-logo/Saudi 2027-07.png" 
            alt="AFC Logo" 
            className="h-32 object-contain mb-6" 
            onError={(e) => e.target.style.display = 'none'}
          />
          <h1 className="text-2xl font-black text-white text-center tracking-tight uppercase">Tournament Performance Dashboard</h1>
          <p className="text-[10px] text-[#c88214] font-black mt-2 uppercase tracking-[0.2em]">Authorized Access Only</p>
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
            <label className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-2 block">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full surface-inset border border-[#c88214]/30 rounded-xl px-4 py-3 text-sm text-[#eef7f5] focus:outline-none focus:border-[#c88214] transition-all duration-200"
              placeholder="name@example.com"
              required 
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-2 block">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full surface-inset border border-[#c88214]/30 rounded-xl px-4 py-3 text-sm text-[#eef7f5] focus:outline-none focus:border-[#c88214] transition-all duration-200"
              placeholder="••••••••"
              required 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full gradient-gold hover:brightness-110 text-[#043e3f] rounded-xl py-3.5 text-xs font-black uppercase tracking-widest transition-all mt-4 disabled:opacity-100"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
