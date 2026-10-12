import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ticketsApi } from '../services/api.js';
import { StatusBadge, PriorityBadge } from '../components/Badge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import { PlusCircle, Ticket, Calendar, Clock, RefreshCw } from 'lucide-react';

export default function CustomerDashboard() {
  const [tickets, setTickets] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTickets = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ticketsApi.list({
        status: statusFilter || undefined,
        page,
        limit: 20,
        sort: '-created_at'
      });
      setTickets(res.data);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTickets(1);
  }, [fetchTickets]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Ticket className="w-6 h-6 text-indigo-400" />
            My Support Tickets
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track inquiries, view agent updates, and communicate with support
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTickets(meta.page)}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh tickets"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/tickets/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create New Ticket</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { label: 'All Tickets', value: '' },
          { label: 'Open', value: 'open' },
          { label: 'In Progress', value: 'in_progress' },
          { label: 'Resolved', value: 'resolved' }
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              statusFilter === tab.value
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Content */}
      {loading ? (
        <LoadingSpinner text="Loading your support tickets..." />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={statusFilter ? `No ${statusFilter.replace('_', ' ')} tickets` : 'No support tickets yet'}
          description="Have questions or encountering an issue? Submit a new ticket and our team will assist you."
          action={
            <Link
              to="/tickets/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
            >
              <PlusCircle className="w-4 h-4" />
              Open a Ticket
            </Link>
          }
        />
      ) : (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
          <div className="divide-y divide-slate-700/60">
            {tickets.map((t) => (
              <Link
                key={t.id}
                to={`/tickets/${t.id}`}
                className="block p-5 hover:bg-slate-750 hover:bg-slate-700/30 transition group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      <span className="text-xs text-slate-400 font-mono">#{t.id.slice(0, 8)}</span>
                    </div>
                    <h3 className="text-base font-semibold text-white group-hover:text-indigo-300 transition truncate">
                      {t.subject}
                    </h3>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center text-xs text-slate-400 shrink-0 gap-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={(p) => fetchTickets(p)}
          />
        </div>
      )}
    </div>
  );
}
