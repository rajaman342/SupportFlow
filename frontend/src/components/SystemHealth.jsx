import React, { useState, useEffect } from 'react';
import { Activity, Database, Server, RefreshCw, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function SystemHealth() {
  const [isOpen, setIsOpen] = useState(false);
  const [health, setHealth] = useState({ loading: true, data: null, error: null });
  const [ready, setReady] = useState({ loading: true, data: null, error: null });
  const [lastChecked, setLastChecked] = useState(null);

  const fetchStatus = async () => {
    setHealth((prev) => ({ ...prev, loading: true }));
    setReady((prev) => ({ ...prev, loading: true }));

    try {
      const res = await fetch('/health');
      const json = await res.json();
      setHealth({ loading: false, data: json, error: null });
    } catch (err) {
      setHealth({ loading: false, data: null, error: err.message });
    }

    try {
      const res = await fetch('/ready');
      const json = await res.json();
      if (res.ok) {
        setReady({ loading: false, data: json, error: null });
      } else {
        setReady({ loading: false, data: json, error: json.error?.message || 'Not ready' });
      }
    } catch (err) {
      setReady({ loading: false, data: null, error: err.message });
    }

    setLastChecked(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health.data?.data?.status === 'ok';
  const isReady = ready.data?.data?.status === 'ready';
  const systemOk = isHealthy && isReady;

  return (
    <div className="border border-slate-700/80 rounded-lg bg-slate-800/80 overflow-hidden text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-slate-300 hover:text-white hover:bg-slate-700/40 transition"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${systemOk ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}
          />
          <span className="font-medium">System Status</span>
          <span className="text-slate-400">({systemOk ? 'All Systems Healthy' : 'Degraded'})</span>
        </div>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {isOpen && (
        <div className="p-3 border-t border-slate-700/60 bg-slate-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Last checked: {lastChecked || 'Checking...'}</span>
            <button
              onClick={fetchStatus}
              disabled={health.loading || ready.loading}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${health.loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-slate-800 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-medium text-slate-200">
                  <Server className="w-3.5 h-3.5 text-indigo-400" /> API Liveness
                </span>
                {isHealthy ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
              <p className="mt-1 text-slate-400 truncate">
                {isHealthy ? 'Status: 200 OK' : health.error || 'Unavailable'}
              </p>
            </div>

            <div className="p-2 rounded bg-slate-800 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-medium text-slate-200">
                  <Database className="w-3.5 h-3.5 text-indigo-400" /> Readiness
                </span>
                {isReady ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
              <p className="mt-1 text-slate-400 truncate">
                {isReady ? 'DB + Redis Healthy' : ready.error || 'Unavailable'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
