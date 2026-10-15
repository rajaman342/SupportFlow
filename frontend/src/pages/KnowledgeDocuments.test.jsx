import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import KnowledgeDocuments from './KnowledgeDocuments.jsx';
import { api } from '../services/api.js';
import * as AuthContextModule from '../context/AuthContext.jsx';

describe('KnowledgeDocuments Page Component', () => {
  const mockDocs = [
    {
      id: 'doc-1',
      title: 'Customer Refund Policy',
      activeVersionId: 'v-1',
      activeVersion: { id: 'v-1', versionNumber: 1, status: 'indexed', pageCount: 3 },
      latestVersion: {
        id: 'v-1',
        versionNumber: 1,
        status: 'indexed',
        originalFilename: 'refund_policy.pdf',
        pageCount: 3
      },
      chunkCount: 12,
      createdAt: new Date().toISOString()
    },
    {
      id: 'doc-2',
      title: 'Shipping and Delivery Guidelines',
      activeVersionId: 'v-2a',
      activeVersion: { id: 'v-2a', versionNumber: 1, status: 'indexed', pageCount: 2 },
      latestVersion: {
        id: 'v-2b',
        versionNumber: 2,
        status: 'processing',
        originalFilename: 'shipping_v2.pdf',
        pageCount: 4
      },
      chunkCount: 8,
      createdAt: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'agent-1', role: 'agent' },
      isStaff: true,
      isAdmin: false
    });
  });

  it('renders list of knowledge documents with titles, status badges and chunk counts', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { data: mockDocs, meta: { total: 2 } }
    });

    render(
      <MemoryRouter>
        <KnowledgeDocuments />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading knowledge documents.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Customer Refund Policy')).toBeInTheDocument();
      expect(screen.getByText('Shipping and Delivery Guidelines')).toBeInTheDocument();
      expect(screen.getByText(/12 chunks/i)).toBeInTheDocument();
      expect(screen.getByText(/Serving v1/i)).toBeInTheDocument();
    });
  });

  it('opens the upload modal when Upload Document button is clicked', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { data: mockDocs, meta: { total: 2 } }
    });

    render(
      <MemoryRouter>
        <KnowledgeDocuments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Customer Refund Policy')).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole('button', { name: /Upload Document/i });
    fireEvent.click(uploadBtn);

    expect(screen.getByText('Upload Knowledge PDF')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Return and Refund Policy/i)).toBeInTheDocument();
  });

  it('renders empty state when no documents exist', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { data: [], meta: { total: 0 } }
    });

    render(
      <MemoryRouter>
        <KnowledgeDocuments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No documents found')).toBeInTheDocument();
    });
  });
});
