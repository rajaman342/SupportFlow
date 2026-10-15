import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { StatusBadge } from '../components/Badge.jsx';
import {
  BookOpen,
  Upload,
  RefreshCw,
  Trash2,
  Download,
  Search,
  FileText,
  AlertTriangle,
  Layers,
  CheckCircle,
  Clock,
  X
} from 'lucide-react';

export default function KnowledgeDocuments() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Replace modal state
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [targetDoc, setTargetDoc] = useState(null);
  const [replaceFile, setReplaceFile] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState(null);

  // Action status message
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (searchQuery) params.q = searchQuery;
      if (statusFilter) params.status = statusFilter;

      const res = await api.get('/documents', { params });
      setDocuments(res.data.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load knowledge documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDocuments();
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadTitle.trim() || !uploadFile) {
      setUploadError('Please provide a title and select a PDF file');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append('title', uploadTitle.trim());
      formData.append('file', uploadFile);

      await api.post('/documents', formData);

      setUploadModalOpen(false);
      setUploadTitle('');
      setUploadFile(null);
      setActionSuccess('Document uploaded successfully. Processing queued.');
      fetchDocuments();
    } catch (err) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceSubmit = async (e) => {
    e.preventDefault();
    if (!replaceFile || !targetDoc) {
      setReplaceError('Please select a PDF file');
      return;
    }

    try {
      setReplacing(true);
      setReplaceError(null);

      const formData = new FormData();
      formData.append('file', replaceFile);

      await api.put(`/documents/${targetDoc.id}/file`, formData);

      setReplaceModalOpen(false);
      setTargetDoc(null);
      setReplaceFile(null);
      setActionSuccess('Replacement file uploaded. Processing queued without interrupting active version.');
      fetchDocuments();
    } catch (err) {
      setReplaceError(err.message || 'Failed to replace document file');
    } finally {
      setReplacing(false);
    }
  };

  const handleReindex = async (docId) => {
    try {
      setError(null);
      await api.post(`/documents/${docId}/reindex`);
      setActionSuccess('Re-index job enqueued using stored file.');
      fetchDocuments();
    } catch (err) {
      setError(err.message || 'Failed to trigger re-index');
    }
  };

  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"? Retrieval will stop immediately.`)) {
      return;
    }

    try {
      setError(null);
      await api.delete(`/documents/${docId}`);
      setActionSuccess(`Document "${title}" deleted.`);
      fetchDocuments();
    } catch (err) {
      setError(err.message || 'Failed to delete document');
    }
  };

  const handleDownload = async (docId) => {
    try {
      setError(null);
      const res = await api.get(`/documents/${docId}/download-url`);
      const { url } = res.data.data;
      window.open(url, '_blank');
    } catch (err) {
      setError(err.message || 'Failed to generate download URL');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            Knowledge Base
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload policy PDFs, monitor background chunking and vector indexing, and manage document versions.
          </p>
        </div>

        <button
          onClick={() => {
            setUploadError(null);
            setUploadModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg shadow-sm transition self-start sm:self-auto"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-sm rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Filters and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by title..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter documents by indexing status"
            className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="indexed">Indexed</option>
            <option value="processing">Processing</option>
            <option value="uploaded">Uploaded</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={fetchDocuments}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-700 rounded-lg transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Document List */}
      {loading ? (
        <LoadingSpinner text="Loading knowledge documents..." />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents found"
          description={
            searchQuery || statusFilter
              ? 'No documents matched your filters.'
              : 'Upload policy PDFs to enable vector retrieval and AI-assisted drafts.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {documents.map((doc) => {
            const latest = doc.latestVersion || {};
            const active = doc.activeVersion;
            const isServingPrevious = active && latest.id !== active.id && latest.status !== 'indexed';

            return (
              <div
                key={doc.id}
                className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-5 hover:border-slate-600 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-semibold text-white text-base">{doc.title}</h3>
                    <StatusBadge status={latest.status || 'uploaded'} />
                    {isServingPrevious && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-950/70 text-amber-300 border border-amber-800/60 font-medium">
                        <Clock className="w-3 h-3" />
                        Serving v{active.versionNumber}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                    <span>File: {latest.originalFilename || 'document.pdf'}</span>
                    <span>•</span>
                    <span>Version: v{latest.versionNumber || 1}</span>
                    {latest.pageCount && (
                      <>
                        <span>•</span>
                        <span>{latest.pageCount} pages</span>
                      </>
                    )}
                    {doc.chunkCount !== undefined && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Layers className="w-3 h-3 text-indigo-400" />
                          {doc.chunkCount} chunks
                        </span>
                      </>
                    )}
                  </div>

                  {latest.status === 'failed' && (
                    <div className="mt-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 px-3 py-1.5 rounded flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      <span>
                        Processing failed ({latest.errorCode || 'ERROR'}): {latest.errorMessage || 'Extraction error'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-start md:self-center">
                  {doc.activeVersionId && (
                    <button
                      onClick={() => handleDownload(doc.id)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-1.5 transition"
                      title="Download active PDF"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Download</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setTargetDoc(doc);
                      setReplaceError(null);
                      setReplaceModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-1.5 transition"
                    title="Upload replacement version"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span>Replace</span>
                  </button>

                  <button
                    onClick={() => handleReindex(doc.id)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-1.5 transition"
                    title="Re-index document"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Re-index</span>
                  </button>

                  <button
                    onClick={() => handleDelete(doc.id, doc.title)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-700 rounded-lg transition"
                    title="Delete document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-400" />
                Upload Knowledge PDF
              </h2>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadError && <Alert type="error" message={uploadError} onDismiss={() => setUploadError(null)} />}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Return and Refund Policy"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  PDF File (Max 10MB)
                </label>
                <input
                  type="file"
                  required
                  accept="application/pdf,.pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-600 file:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Replace Modal */}
      {replaceModalOpen && targetDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-400" />
                Replace File: {targetDoc.title}
              </h2>
              <button
                onClick={() => setReplaceModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Safe replacement guarantee: The existing active version remains searchable until the new version is successfully extracted, chunked, and embedded.
            </p>

            {replaceError && <Alert type="error" message={replaceError} onDismiss={() => setReplaceError(null)} />}

            <form onSubmit={handleReplaceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  New PDF File
                </label>
                <input
                  type="file"
                  required
                  accept="application/pdf,.pdf"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-amber-600 file:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReplaceModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replacing}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition disabled:opacity-50"
                >
                  {replacing ? 'Uploading...' : 'Replace & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
