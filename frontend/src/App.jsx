import React, { useState, useEffect } from 'react';
import { Activity, Database, Server, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [health, setHealth] = useState({ loading: true, data: null, error: null });
  const [ready, setReady] = useState({ loading: true, data: null, error: null });
  const [lastChecked, setLastChecked] = useState(null);

  const fetchStatus = async () => {
    setHealth((prev) => ({ ...prev, loading: true }));
    setReady((prev) => ({ ...prev, loading: true }));

    try {
      const healthRes = await fetch('/health');
      const healthJson = await healthRes.json();
      setHealth({ loading: false, data: healthJson, error: null });
    } catch (err) {
      setHealth({ loading: false, data: null, error: err.message });
    }

    try {
      const readyRes = await fetch('/ready');
      const readyJson = await readyRes.json();
      if (readyRes.ok) {
        setReady({ loading: false, data: readyJson, error: null });
      } else {
        setReady({ loading: false, data: readyJson, error: readyJson.error?.message || 'Not ready' });
      }
    } catch (err) {
      setReady({ loading: false, data: null, error: err.message });
    }

    setLastChecked(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health.data?.data?.status === 'ok';
  const isReady = ready.data?.data?.status === 'ready';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Server className="w-6 h-6 text-indigo-400" />
              SupportFlow
            </h1>
            <p className="text-sm text-slate-400">Phase 1 Service Status & Health Dashboard</p>
          </div>
          <button
            onClick={fetchStatus}
            disabled={health.loading || ready.loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${health.loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Liveness / Health */}
          <div className="bg-slate-900/60 border border-slate-700/80 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                API Liveness (/health)
              </span>
              {isHealthy ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400" />
              )}
            </div>
            <div className="text-lg font-bold">
              {health.loading ? (
                <span className="text-slate-500">Checking...</span>
              ) : isHealthy ? (
                <span className="text-emerald-400">Healthy (200 OK)</span>
              ) : (
                <span className="text-rose-400">Degraded</span>
              )}
            </div>
            <p className="text-xs text-slate-400">Process alive and responding to requests.</p>
          </div>

          {/* Readiness */}
          <div className="bg-slate-900/60 border border-slate-700/80 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-blue-400" />
                Readiness (/ready)
              </span>
              {isReady ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div className="text-lg font-bold">
              {ready.loading ? (
                <span className="text-slate-500">Checking...</span>
              ) : isReady ? (
                <span className="text-emerald-400">Ready (200 OK)</span>
              ) : (
                <span className="text-amber-400">503 Unavailable</span>
              )}
            </div>
            <p className="text-xs text-slate-400">PostgreSQL and Redis dependencies online.</p>
          </div>
        </div>

        {/* Detailed Dependency Breakdown */}
        <div className="bg-slate-900/80 rounded-lg border border-slate-700/50 p-4 space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Dependency Status
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-1 border-b border-slate-800">
              <span className="text-slate-300">PostgreSQL + pgvector</span>
              <span className={ready.data?.data?.dependencies?.database ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {ready.data?.data?.dependencies?.database ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800">
              <span className="text-slate-300">Redis (BullMQ & Cache)</span>
              <span className={ready.data?.data?.dependencies?.redis ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {ready.data?.data?.dependencies?.redis ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-300">BullMQ Background Worker</span>
              <span className="text-slate-400 font-medium">Standalone Process</span>
            </div>
          </div>
        </div>

        {lastChecked && (
          <div className="text-center text-xs text-slate-500">
            Last checked at {lastChecked}
          </div>
        )}
      </div>
    </div>
  );
}
