import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import CustomerDashboard from './pages/CustomerDashboard.jsx';
import CreateTicket from './pages/CreateTicket.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import AgentDashboard from './pages/AgentDashboard.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminAuditLogs from './pages/AdminAuditLogs.jsx';
import KnowledgeDocuments from './pages/KnowledgeDocuments.jsx';
import NotFound from './pages/NotFound.jsx';

function RootRedirect() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen text="Loading SupportFlow..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'customer') {
    return <Navigate to="/tickets" replace />;
  }

  return <Navigate to="/agent/tickets" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Authenticated workspace layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Customer Ticket routes */}
        <Route
          path="/tickets"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <CustomerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets/new"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <CreateTicket />
            </ProtectedRoute>
          }
        />

        {/* Ticket Conversation view (customer owner or staff) */}
        <Route path="/tickets/:id" element={<TicketDetail />} />

        {/* Staff Agent routes */}
        <Route
          path="/agent/tickets"
          element={
            <ProtectedRoute allowedRoles={['agent', 'admin']}>
              <AgentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agent/documents"
          element={
            <ProtectedRoute allowedRoles={['agent', 'admin']}>
              <KnowledgeDocuments />
            </ProtectedRoute>
          }
        />

        {/* Admin management routes */}
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAuditLogs />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch-all 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
