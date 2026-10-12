import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { usersApi } from '../services/api.js';
import { RoleBadge, ActiveBadge } from '../components/Badge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  Users,
  UserPlus,
  RefreshCw,
  Mail,
  User,
  Lock,
  Shield,
  CheckCircle,
  XCircle,
  X,
  Loader2
} from 'lucide-react';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('agent');
  const [newTempPassword, setNewTempPassword] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Role Change / Status Action Loading State
  const [actionUserId, setActionUserId] = useState(null);

  const fetchUsers = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const res = await usersApi.list({
          role: roleFilter || undefined,
          active: activeFilter !== '' ? activeFilter === 'true' : undefined,
          page,
          limit: 20
        });
        setUsers(res.data || []);
        if (res.meta) {
          setMeta(res.meta);
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    },
    [roleFilter, activeFilter]
  );

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setError(null);
    setSuccess(null);

    if (newTempPassword.length < 12) {
      setError('Temporary password must be at least 12 characters.');
      setAddLoading(false);
      return;
    }

    try {
      await usersApi.create({
        email: newEmail.trim(),
        fullName: newName.trim(),
        role: newRole,
        temporaryPassword: newTempPassword
      });
      setSuccess(`User ${newEmail} created successfully.`);
      setIsAddModalOpen(false);
      setNewEmail('');
      setNewName('');
      setNewRole('agent');
      setNewTempPassword('');
      fetchUsers(1);
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRoleVal) => {
    setActionUserId(userId);
    setError(null);
    setSuccess(null);
    try {
      const updated = await usersApi.updateRole(userId, newRoleVal);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
      setSuccess('User role updated successfully.');
    } catch (err) {
      setError(err.message || 'Could not update user role');
    } finally {
      setActionUserId(null);
    }
  };

  const handleToggleActive = async (targetUser) => {
    const willBeActive = !targetUser.isActive;
    setActionUserId(targetUser.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await usersApi.updateActive(targetUser.id, willBeActive);
      setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? { ...u, isActive: updated.isActive } : u)));
      setSuccess(`User ${targetUser.email} is now ${willBeActive ? 'active' : 'inactive'}.`);
    } catch (err) {
      setError(err.message || 'Could not change active status');
    } finally {
      setActionUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-400" />
            User Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage organization members, assign roles, and control account activation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchUsers(meta.page)}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title="Refresh users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Selectors */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Roles</option>
            <option value="admin">Administrators</option>
            <option value="agent">Support Agents</option>
            <option value="customer">Customers</option>
          </select>

          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </select>
        </div>
      </div>

      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}
      {success && <Alert type="success" message={success} onDismiss={() => setSuccess(null)} />}

      {/* Users Table */}
      {loading ? (
        <LoadingSpinner text="Loading organization users..." />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users match filters"
          description="Try selecting different roles or active filters."
        />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase font-semibold text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Member</th>
                  <th scope="col" className="px-6 py-3.5">Email</th>
                  <th scope="col" className="px-6 py-3.5">Role</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Joined</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-slate-200">
                {users.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  const isProcessing = actionUserId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-750 hover:bg-slate-700/30 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{u.fullName}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-900/80 text-indigo-300 border border-indigo-700">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400 font-mono">
                        {u.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={u.role} />
                          <select
                            value={u.role}
                            disabled={isProcessing}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            aria-label={`Change role for ${u.fullName}`}
                            className="text-xs bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                          >
                            <option value="customer">Customer</option>
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <ActiveBadge isActive={u.isActive} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleToggleActive(u)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition disabled:opacity-50 ${
                            u.isActive
                              ? 'border-rose-800/80 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50'
                              : 'border-emerald-800/80 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50'
                          }`}
                        >
                          {isProcessing ? 'Updating...' : u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={(p) => fetchUsers(p)}
          />
        </div>
      )}

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Add New Member
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Alex Smith"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="alex@company.com"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="agent">Support Agent</option>
                  <option value="admin">Administrator</option>
                  <option value="customer">Customer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Temporary Password <span className="text-slate-500">(min. 12 characters)</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={newTempPassword}
                  onChange={(e) => setNewTempPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {addLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create User</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
