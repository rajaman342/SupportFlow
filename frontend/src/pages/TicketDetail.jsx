import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ticketsApi, usersApi, aiSuggestionsApi } from '../services/api.js';
import { StatusBadge, PriorityBadge, RoleBadge } from '../components/Badge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';
import {
  ArrowLeft,
  Send,
  User,
  Shield,
  Clock,
  Calendar,
  UserCheck,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageSquare,
  Sparkles,
  Check,
  Edit,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertTriangle
} from 'lucide-react';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isStaff, isAdmin, isCustomer } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // AI Assistant state
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [editedDraftBody, setEditedDraftBody] = useState('');
  const [showSources, setShowSources] = useState(false);

  const messagesEndRef = useRef(null);

  const loadTicketAndMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketData, messagesData] = await Promise.all([
        ticketsApi.get(id),
        ticketsApi.getMessages(id, { limit: 100 })
      ]);
      setTicket(ticketData);
      setMessages(messagesData.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadLatestAiSuggestion = useCallback(async () => {
    if (!isStaff) return;
    try {
      const res = await aiSuggestionsApi.list(id, { limit: 1 });
      if (res.data && res.data.length > 0) {
        setAiSuggestion(res.data[0]);
        setEditedDraftBody(res.data[0].draftBody || '');
      }
    } catch {
      // non-critical if suggestion lookup fails
    }
  }, [id, isStaff]);

  useEffect(() => {
    loadTicketAndMessages();
    loadLatestAiSuggestion();
  }, [loadTicketAndMessages, loadLatestAiSuggestion]);

  const handleGenerateAi = async (force = false) => {
    setAiLoading(true);
    setError(null);
    try {
      const suggestion = await aiSuggestionsApi.generate(id, force);
      setAiSuggestion(suggestion);
      setEditedDraftBody(suggestion.draftBody || '');
      setEditingDraft(false);
      setActionSuccess(force ? 'Regenerated AI response draft.' : 'Loaded AI response draft.');
    } catch (err) {
      setError(err.message || 'Failed to generate AI draft');
    } finally {
      setAiLoading(false);
    }
  };

  const handleReviewAi = async (action) => {
    if (!aiSuggestion) return;
    setAiReviewLoading(true);
    setError(null);
    try {
      const payload = { action };
      if (action === 'edit_approve') {
        payload.body = editedDraftBody.trim();
      }
      const updated = await aiSuggestionsApi.review(aiSuggestion.id, payload);
      setAiSuggestion(updated);
      setEditingDraft(false);

      if (action === 'approve' || action === 'edit_approve') {
        const messagesData = await ticketsApi.getMessages(id, { limit: 100 });
        setMessages(messagesData.data || []);
        setActionSuccess('AI draft approved and posted to ticket conversation.');
        setTimeout(scrollToBottom, 100);
      } else if (action === 'reject') {
        setActionSuccess('AI suggestion rejected.');
      } else if (action === 'dismiss') {
        setActionSuccess('AI suggestion dismissed.');
      }
    } catch (err) {
      setError(err.message || `Failed to ${action} AI suggestion`);
    } finally {
      setAiReviewLoading(false);
    }
  };

  // If admin, load staff members for assignment options
  useEffect(() => {
    if (isAdmin) {
      usersApi
        .list({ active: true, limit: 100 })
        .then((res) => {
          const staff = (res.data || []).filter((u) => u.role === 'agent' || u.role === 'admin');
          setStaffList(staff);
        })
        .catch(() => {
          // non-critical if staff lookup fails
        });
    }
  }, [isAdmin]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!replyBody.trim()) return;

    setSendingMessage(true);
    setError(null);
    try {
      const newMessage = await ticketsApi.createMessage(id, { body: replyBody.trim() });
      setMessages((prev) => [...prev, newMessage]);
      setReplyBody('');

      // If customer sent message on resolved ticket, ticket status was auto-reopened
      if (ticket.status === 'resolved' && isCustomer) {
        setTicket((prev) => ({ ...prev, status: 'open', resolvedAt: null }));
        setActionSuccess('Your message reopened this ticket.');
      }

      setTimeout(scrollToBottom, 100);
    } catch (err) {
      setError(err.message || 'Failed to post message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const updated = await ticketsApi.updateStatus(id, newStatus);
      setTicket(updated);
      setActionSuccess(`Ticket status updated to ${newStatus.replace('_', ' ')}.`);
    } catch (err) {
      setError(err.message || 'Could not update ticket status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (targetAgentId) => {
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const updated = await ticketsApi.assign(id, targetAgentId);
      setTicket(updated);
      setActionSuccess(targetAgentId ? 'Ticket assigned successfully.' : 'Ticket unassigned.');
    } catch (err) {
      setError(err.message || 'Could not update assignment');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePriorityChange = async (newPriority) => {
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const updated = await ticketsApi.update(id, { priority: newPriority });
      setTicket(updated);
      setActionSuccess(`Priority changed to ${newPriority}.`);
    } catch (err) {
      setError(err.message || 'Could not update priority');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen={false} text="Loading ticket conversation..." />;
  }

  if (error && !ticket) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Alert type="error" title="Could not find ticket" message={error} />
        <Link
          to={isStaff ? '/agent/tickets' : '/tickets'}
          className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to tickets list
        </Link>
      </div>
    );
  }

  const backLink = isStaff ? '/agent/tickets' : '/tickets';
  const isAssignedToCurrentAgent = ticket.assignedAgent?.id === user?.id;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back and Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <Link
          to={backLink}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to {isStaff ? 'Ticket Queue' : 'My Tickets'}</span>
        </Link>
        <span className="text-xs font-mono text-slate-500">ID: {ticket.id}</span>
      </div>

      {actionSuccess && (
        <Alert
          type="success"
          message={actionSuccess}
          onDismiss={() => setActionSuccess(null)}
        />
      )}
      {error && (
        <Alert
          type="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Main Grid: Ticket Details (Left) + Sidebar Controls (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Conversation Thread & Message Box */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {ticket.subject}
            </h1>
            <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap pt-2 border-t border-slate-700/60">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Customer: <strong className="text-slate-200">{ticket.customer?.fullName || 'Customer'}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Created: {new Date(ticket.createdAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Conversation Messages */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-xl space-y-6">
            <h2 className="text-base font-semibold text-white flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              Conversation History ({messages.length})
            </h2>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {messages.map((msg) => {
                const isCustomerMsg = msg.senderRole === 'customer';
                const isMyMessage = msg.senderId === user?.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isCustomerMsg ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 space-y-1.5 text-sm shadow-md ${
                        isCustomerMsg
                          ? 'bg-slate-900 border border-slate-700 text-slate-200'
                          : 'bg-indigo-950/70 border border-indigo-700/50 text-indigo-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-xs opacity-75 border-b border-white/10 pb-1">
                        <span className="font-semibold flex items-center gap-1">
                          {isCustomerMsg ? (
                            <User className="w-3.5 h-3.5" />
                          ) : (
                            <Shield className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                          {msg.senderName || (isCustomerMsg ? 'Customer' : 'Support Agent')}
                          {isMyMessage && ' (You)'}
                        </span>
                        <span className="text-[11px] font-mono">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed break-words font-sans">
                        {msg.body}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Assistant Panel (Staff Only) */}
            {isStaff && (
              <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-white tracking-wide">
                      AI Response Assistant
                    </h3>
                    {(!aiSuggestion || aiSuggestion.provider === 'mock') && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        Mock AI (development)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={aiLoading || aiReviewLoading}
                      onClick={() => handleGenerateAi(Boolean(aiSuggestion))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-sm disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{aiSuggestion ? 'Regenerate Draft' : 'Generate AI Draft'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {aiSuggestion ? (
                  <div className="space-y-3 pt-2 border-t border-slate-800">
                    {/* Outcome and Category Info */}
                    <div className="flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-300">Status:</span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                          aiSuggestion.reviewStatus === 'approved' || aiSuggestion.reviewStatus === 'edited_approved'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : aiSuggestion.reviewStatus === 'rejected'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : aiSuggestion.reviewStatus === 'dismissed'
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        }`}>
                          {aiSuggestion.reviewStatus.replace('_', ' ')}
                        </span>

                        {aiSuggestion.suggestedCategory && (
                          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px] border border-slate-700">
                            Category: {aiSuggestion.suggestedCategory}
                          </span>
                        )}
                        {aiSuggestion.suggestedPriority && (
                          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px] border border-slate-700">
                            Priority: {aiSuggestion.suggestedPriority}
                          </span>
                        )}
                      </div>

                      {aiSuggestion.topSimilarity !== null && (
                        <span className="text-slate-400 text-[11px]">
                          Top Similarity: {(aiSuggestion.topSimilarity * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {/* Warning if any cited source has changed */}
                    {aiSuggestion.sources?.some((s) => s.sourceState && s.sourceState !== 'current') && (
                      <div className="p-3 bg-amber-950/40 border border-amber-600/40 rounded-lg text-amber-200 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>Warning: A cited document was replaced or deleted since this draft was generated.</span>
                      </div>
                    )}

                    {/* Outcome: Answered */}
                    {aiSuggestion.outcome === 'answered' && (
                      <div className="space-y-2">
                        {editingDraft ? (
                          <div className="space-y-2">
                            <textarea
                              rows={4}
                              value={editedDraftBody}
                              onChange={(e) => setEditedDraftBody(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-950 border border-indigo-500/50 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="Edit response before approving..."
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDraft(false);
                                  setEditedDraftBody(aiSuggestion.draftBody || '');
                                }}
                                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs transition"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={aiReviewLoading || !editedDraftBody.trim()}
                                onClick={() => handleReviewAi('edit_approve')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition disabled:opacity-50"
                              >
                                {aiReviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                <span>Approve with Edits</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-3">
                            <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                              {aiSuggestion.draftBody}
                            </p>

                            {aiSuggestion.reviewStatus === 'pending_review' && (
                              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 flex-wrap gap-2">
                                <span className="text-xs text-slate-400 italic">
                                  Review required: Human approval will post this reply to the customer.
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={aiReviewLoading}
                                    onClick={() => handleReviewAi('reject')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition disabled:opacity-50"
                                  >
                                    <X className="w-3.5 h-3.5 text-red-400" />
                                    <span>Reject</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={aiReviewLoading}
                                    onClick={() => setEditingDraft(true)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-700/60 hover:bg-indigo-900/40 text-indigo-200 text-xs font-medium transition disabled:opacity-50"
                                  >
                                    <Edit className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Edit & Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={aiReviewLoading}
                                    onClick={() => handleReviewAi('approve')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-sm disabled:opacity-50"
                                  >
                                    {aiReviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    <span>Approve Draft</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Outcome: Insufficient Evidence */}
                    {aiSuggestion.outcome === 'insufficient_evidence' && (
                      <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg space-y-2">
                        <p className="text-xs text-amber-200">
                          Insufficient Evidence: The knowledge base does not contain enough verified information to generate a grounded response.
                        </p>
                        {aiSuggestion.reviewStatus === 'pending_review' && (
                          <button
                            type="button"
                            disabled={aiReviewLoading}
                            onClick={() => handleReviewAi('dismiss')}
                            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    )}

                    {/* Outcome: Conflicting Evidence */}
                    {aiSuggestion.outcome === 'conflicting_evidence' && (
                      <div className="p-3 bg-purple-950/20 border border-purple-800/30 rounded-lg space-y-2">
                        <p className="text-xs text-purple-200">
                          Conflicting Evidence: Policy documents contain conflicting information. Please review sources manually.
                        </p>
                        {aiSuggestion.reviewStatus === 'pending_review' && (
                          <button
                            type="button"
                            disabled={aiReviewLoading}
                            onClick={() => handleReviewAi('dismiss')}
                            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    )}

                    {/* Retrieved Sources Snapshot */}
                    {aiSuggestion.sources && aiSuggestion.sources.length > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowSources(!showSources)}
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            {showSources ? 'Hide Sources' : `View Retrieved Sources (${aiSuggestion.sources.length})`}
                          </span>
                          {showSources ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {showSources && (
                          <div className="mt-2.5 space-y-2 max-h-60 overflow-y-auto pr-1">
                            {aiSuggestion.sources.map((src) => (
                              <div
                                key={src.id || src.rank}
                                className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between text-slate-400 flex-wrap gap-1">
                                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.2 rounded bg-indigo-900/50 text-indigo-300 font-mono text-[10px]">
                                      [{src.rank}]
                                    </span>
                                    {src.documentTitle} (p. {src.pageNumber})
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {src.citedInAnswer && (
                                      <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[10px] border border-emerald-800/40">
                                        Cited in Answer
                                      </span>
                                    )}
                                    <span className="text-slate-500 font-mono text-[10px]">
                                      {(src.similarity * 100).toFixed(0)}% match
                                    </span>
                                  </div>
                                </div>
                                <p className="text-slate-300 line-clamp-3 text-[11px] leading-relaxed">
                                  "{src.snippet}"
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-lg text-xs text-slate-400 flex items-center justify-between">
                    <span>No draft generated yet. Click "Generate AI Draft" to retrieve relevant knowledge base policies.</span>
                  </div>
                )}
              </div>
            )}

            {/* Reply Form */}
            <form onSubmit={handleSendMessage} className="pt-4 border-t border-slate-700/60 space-y-3">
              {ticket.status === 'resolved' && isCustomer && (
                <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800/40 p-2.5 rounded-lg flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  This ticket is currently resolved. Sending a message will automatically reopen it.
                </p>
              )}

              <div>
                <label htmlFor="replyBody" className="sr-only">
                  Add reply
                </label>
                <textarea
                  id="replyBody"
                  required
                  rows={4}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your response here..."
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-y"
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={sendingMessage || !replyBody.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Reply</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Ticket Actions & Sidebar Controls */}
        <div className="space-y-6">
          {/* Status & Lifecycle Controls */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Ticket Status
            </h3>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700/80">
              <span className="text-sm text-slate-300">Current Status:</span>
              <StatusBadge status={ticket.status} />
            </div>

            {/* Staff Status Actions */}
            {isStaff && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-medium text-slate-400 block">Actions:</span>
                {ticket.status === 'open' && (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange('in_progress')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-50"
                    >
                      <span>Start Working (In Progress)</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange('resolved')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition disabled:opacity-50"
                      title="Requires at least one agent response"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Resolve Ticket</span>
                    </button>
                  </>
                )}

                {ticket.status === 'in_progress' && (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange('open')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium transition disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Return to Open</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange('resolved')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Resolve Ticket</span>
                    </button>
                  </>
                )}

                {ticket.status === 'resolved' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange('open')}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reopen Ticket</span>
                  </button>
                )}
              </div>
            )}

            {/* Customer Reopen Action if Resolved */}
            {isCustomer && ticket.status === 'resolved' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleStatusChange('open')}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reopen Ticket</span>
              </button>
            )}
          </div>

          {/* Assignment Controls (Staff Only) */}
          {isStaff && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Assignment
              </h3>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-700/80 text-sm">
                <span className="text-xs text-slate-400 block mb-1">Assigned Agent:</span>
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  {ticket.assignedAgent?.fullName || 'Unassigned'}
                </span>
              </div>

              {/* Agent Self-Assign / Unassign */}
              <div className="space-y-2">
                {!isAssignedToCurrentAgent ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAssign(user.id)}
                    className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    Assign to Myself
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAssign(null)}
                    className="w-full py-2 px-3 rounded-lg border border-slate-700 hover:bg-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-50"
                  >
                    Unassign Myself
                  </button>
                )}

                {/* Admin Delegation Dropdown */}
                {isAdmin && (
                  <div className="pt-2 border-t border-slate-700/60">
                    <label htmlFor="adminAssignSelect" className="text-xs text-slate-400 block mb-1.5">
                      Admin: Delegate to Staff
                    </label>
                    <select
                      id="adminAssignSelect"
                      value={ticket.assignedAgent?.id || ''}
                      onChange={(e) => handleAssign(e.target.value || null)}
                      disabled={actionLoading}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Unassigned --</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} ({s.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Priority Adjustment (Staff Only) */}
          {isStaff && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Priority
              </h3>
              <select
                value={ticket.priority}
                onChange={(e) => handlePriorityChange(e.target.value)}
                disabled={actionLoading}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:ring-2 focus:ring-indigo-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
