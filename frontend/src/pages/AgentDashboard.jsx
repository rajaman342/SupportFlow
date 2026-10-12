import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ticketsApi } from '../services/api.js';
import { StatusBadge, PriorityBadge } from '../components/Badge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  Search,
  Filter,
  UserCheck,
  RefreshCw,
  Ticket,
  User,
  Calendar,
  Clock
} from 'lucide-react';

export default function AgentDashboard() {
  const { user } = useAuth();

  const [tickets, setTickets] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTickets = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const res = await ticketsApi.list({
          q: searchQuery.trim() || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          assignedToMe: assignedToMe ? true : undefined,
          page,
          limit: 20,
          sort: '-created_at'
        });
        setTickets(res.data || []);
        if (res.meta) {
          setMeta(res.meta);
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch tickets');
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, statusFilter, priorityFilter, assignedToMe]
  );

  useEffect(() => {
    fetchTickets(1);
  }, [fetchTickets]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchTickets(1);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Ticket className="w-6 h-6 text-indigo-400" />
            Support Ticket Queue
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organization-wide tickets triage, assignment, and resolution workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTickets(meta.page)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-xl space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search input */}
          <form onSubmit={handleSearchSubmit} className="md:col-span-2 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by subject (full-text search)..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </form>

          {/* Status filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {/* Priority filter */}
          <div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Assigned to Me checkbox */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={assignedToMe}
              onChange={(e) => setAssignedToMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              Only show tickets assigned to me
            </span>
          </label>
        </div>
      </div>

      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Tickets List */}
      {loading ? (
        <LoadingSpinner text="Loading ticket queue..." />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No tickets match criteria"
          description="Try adjusting your filters or search terms."
        />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase font-semibold text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Ticket</th>
                  <th scope="col" className="px-6 py-3.5">Customer</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Priority</th>
                  <th scope="col" className="px-6 py-3.5">Assignee</th>
                  <th scope="col" className="px-6 py-3.5">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-slate-200">
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-750 hover:bg-slate-700/30 transition group"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/tickets/${t.id}`}
                        className="font-semibold text-white group-hover:text-indigo-300 transition block truncate max-w-md"
                      >
                        {t.subject}
                      </Link>
                      <span className="text-xs text-slate-500 font-mono">#{t.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t.customer?.fullName || 'Customer'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      {t.assignedAgent ? (
                        <span className="inline-flex items-center gap-1 text-slate-200 font-medium">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                          {t.assignedAgent.fullName}
                          {t.assignedAgent.id === user?.id && ' (You)'}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                      {new Date(t.createdAt).toLocaleDateString()}
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
            onPageChange={(p) => fetchTickets(p)}
          />
        </div>
      )}
    </div>
  );
}
