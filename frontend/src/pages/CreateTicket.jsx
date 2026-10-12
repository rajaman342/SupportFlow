import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ticketsApi } from '../services/api.js';
import Alert from '../components/Alert.jsx';
import { PlusCircle, ArrowLeft, Loader2, Send } from 'lucide-react';

export default function CreateTicket() {
  const navigate = useNavigate();

  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('medium');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (subject.trim().length < 3) {
      setError({
        title: 'Validation Error',
        message: 'Subject must be at least 3 characters long.'
      });
      return;
    }

    if (body.trim().length < 1) {
      setError({
        title: 'Validation Error',
        message: 'Please provide a message describing your inquiry or issue.'
      });
      return;
    }

    setLoading(true);

    try {
      const ticket = await ticketsApi.create({
        subject: subject.trim(),
        priority,
        body: body.trim()
      });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError({
        title: 'Failed to Create Ticket',
        message: err.message || 'An unexpected error occurred',
        details: err.details
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
        <Link
          to="/tickets"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          aria-label="Back to tickets list"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-indigo-400" />
            Open a New Support Ticket
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Describe the problem or question and a support agent will review it
          </p>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          title={error.title}
          message={error.message}
          details={error.details}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Form Card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 sm:p-8 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="subject" className="block text-sm font-semibold text-slate-200">
              Subject <span className="text-rose-400">*</span>
            </label>
            <p className="text-xs text-slate-400 mb-2">Summarize the issue in a few words</p>
            <input
              id="subject"
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Cannot process credit card refund for order #1234"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="priority" className="block text-sm font-semibold text-slate-200">
              Suggested Priority
            </label>
            <p className="text-xs text-slate-400 mb-2">
              Indicate the urgency (support agents may adjust based on triage)
            </p>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="low">Low — General inquiry, no disruption</option>
              <option value="medium">Medium — Normal inquiry or minor issue</option>
              <option value="high">High — Significant impact or urgent policy inquiry</option>
              <option value="urgent">Urgent — Critical blocker</option>
            </select>
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-semibold text-slate-200">
              Message / Description <span className="text-rose-400">*</span>
            </label>
            <p className="text-xs text-slate-400 mb-2">
              Provide complete context, steps to reproduce, or any relevant details
            </p>
            <textarea
              id="body"
              required
              rows={6}
              maxLength={10000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your issue with as much detail as possible..."
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm resize-y font-sans"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/60">
            <Link
              to="/tickets"
              className="px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 text-sm font-medium transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
