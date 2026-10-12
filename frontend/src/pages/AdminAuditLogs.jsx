import React, { useState, useEffect, useCallback } from 'react';
import { auditLogsApi } from '../services/api.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import { Shield, RefreshCw, Calendar, Activity, Hash } from 'lucide-react';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const res = await auditLogsApi.list({
          action: actionFilter || undefined,
          page,
          limit: 20
        });
        setLogs(res.data || []);
        if (res.meta) {
          setMeta(res.meta);
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch audit logs');
      } finally {
        setLoading(false);
      }
    },
    [actionFilter]
  );

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-indigo-400" />
            Security Audit Trail
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Immutable, append-only log of security events, status transitions, and administrative actions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs(meta.page)}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title="Refresh audit logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl p-4">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Actions</option>
          <option value="auth.login">auth.login</option>
          <option value="auth.logout">auth.logout</option>
          <option value="auth.register">auth.register</option>
          <option value="ticket.created">ticket.created</option>
          <option value="ticket.status_changed">ticket.status_changed</option>
          <option value="ticket.assigned">ticket.assigned</option>
          <option value="ticket.reopened_by_customer_message">ticket.reopened_by_customer_message</option>
          <option value="user.created">user.created</option>
          <option value="user.role_changed">user.role_changed</option>
          <option value="user.active_changed">user.active_changed</option>
        </select>
      </div>

      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Logs Table */}
      {loading ? (
        <LoadingSpinner text="Loading audit trail records..." />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No audit entries"
          description="There are no audit events matching the selected filter."
        />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase font-semibold text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Timestamp</th>
                  <th scope="col" className="px-6 py-3.5">Action</th>
                  <th scope="col" className="px-6 py-3.5">Actor</th>
                  <th scope="col" className="px-6 py-3.5">Target Entity</th>
                  <th scope="col" className="px-6 py-3.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-slate-200 font-mono text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-750 hover:bg-slate-700/30 transition">
                    <td className="px-6 py-3.5 whitespace-nowrap text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700 text-indigo-300 font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-slate-300">
                      {log.actorId ? log.actorId.slice(0, 8) : 'system'}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-slate-400">
                      {log.entityType ? `${log.entityType}:${log.entityId ? log.entityId.slice(0, 8) : ''}` : '-'}
                    </td>
                    <td className="px-6 py-3.5 text-slate-300 font-sans max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={(p) => fetchLogs(p)}
          />
        </div>
      )}
    </div>
  );
}
