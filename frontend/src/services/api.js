let accessToken = null;
let refreshPromise = null;
const authFailureListeners = new Set();

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function onAuthFailure(callback) {
  authFailureListeners.add(callback);
  return () => authFailureListeners.delete(callback);
}

function notifyAuthFailure() {
  setAccessToken(null);
  for (const listener of authFailureListeners) {
    try {
      listener();
    } catch {
      // ignore errors in listeners
    }
  }
}

/**
 * Single-flight refresh token operation.
 * Prevents multiple simultaneous refresh calls when several API requests return 401.
 */
export async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'supportflow'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        notifyAuthFailure();
        return null;
      }

      const body = await response.json();
      const token = body.data?.accessToken;
      if (token) {
        setAccessToken(token);
        return token;
      }
      notifyAuthFailure();
      return null;
    } catch {
      notifyAuthFailure();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export class ApiError extends Error {
  constructor(status, errorPayload) {
    super(errorPayload?.message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = errorPayload?.code || 'UNKNOWN_ERROR';
    this.details = errorPayload?.details || null;
    this.requestId = errorPayload?.requestId || null;
  }
}

/**
 * Universal fetch wrapper for SupportFlow API
 */
export async function request(path, options = {}) {
  const url = path.startsWith('/api') || path.startsWith('/health') || path.startsWith('/ready')
    ? path
    : `/api/v1${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = {
    'X-Requested-With': 'supportflow',
    ...options.headers
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const fetchOptions = {
    ...options,
    headers,
    credentials: 'include'
  };

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: err.message || 'Network request failed' });
  }

  // Handle 401 Unauthenticated with single-flight refresh and single retry
  const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh');
  if (response.status === 401 && !options._retried && !isAuthEndpoint) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request(path, {
        ...options,
        _retried: true,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`
        }
      });
    }
  }

  if (response.status === 204) {
    return null;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, body?.error);
  }

  return body;
}

// Auth API
export const authApi = {
  login: async (credentials) => {
    const res = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    setAccessToken(res.data.accessToken);
    return res.data;
  },
  register: async (data) => {
    return request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  refresh: async () => {
    return refreshAccessToken();
  },
  logout: async () => {
    try {
      await request('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },
  me: async () => {
    const res = await request('/api/v1/auth/me');
    return res.data?.user;
  }
};

// Tickets API
export const ticketsApi = {
  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/api/v1/tickets${query}`);
  },
  get: async (id) => {
    const res = await request(`/api/v1/tickets/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await request('/api/v1/tickets', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.data;
  },
  update: async (id, data) => {
    const res = await request(`/api/v1/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return res.data;
  },
  assign: async (id, agentId) => {
    const res = await request(`/api/v1/tickets/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agentId })
    });
    return res.data;
  },
  updateStatus: async (id, status) => {
    const res = await request(`/api/v1/tickets/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    return res.data;
  },
  getMessages: async (id, params = {}) => {
    const searchParams = new URLSearchParams(params);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/api/v1/tickets/${id}/messages${query}`);
  },
  createMessage: async (id, data) => {
    const res = await request(`/api/v1/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.data;
  }
};

// Users API (Admin)
export const usersApi = {
  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/api/v1/users${query}`);
  },
  create: async (data) => {
    const res = await request('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.data;
  },
  updateRole: async (id, role) => {
    const res = await request(`/api/v1/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
    return res.data;
  },
  updateActive: async (id, isActive) => {
    const res = await request(`/api/v1/users/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    });
    return res.data;
  }
};

// Audit Logs API (Admin)
export const auditLogsApi = {
  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/api/v1/audit-logs${query}`);
  }
};

// Documents API (Agent/Admin)
export const documentsApi = {
  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/api/v1/documents${query}`);
  },
  get: async (id) => {
    const res = await request(`/api/v1/documents/${id}`);
    return res.data;
  },
  upload: async (formData) => {
    const res = await request('/api/v1/documents', {
      method: 'POST',
      body: formData
    });
    return res.data;
  },
  replace: async (id, formData) => {
    const res = await request(`/api/v1/documents/${id}/file`, {
      method: 'PUT',
      body: formData
    });
    return res.data;
  },
  reindex: async (id) => {
    const res = await request(`/api/v1/documents/${id}/reindex`, {
      method: 'POST'
    });
    return res.data;
  },
  downloadUrl: async (id, version) => {
    const query = version ? `?version=${version}` : '';
    const res = await request(`/api/v1/documents/${id}/download-url${query}`);
    return res.data;
  },
  delete: async (id) => {
    return request(`/api/v1/documents/${id}`, {
      method: 'DELETE'
    });
  }
};

export const aiSuggestionsApi = {
  generate: async (ticketId, force = false) => {
    const res = await request(`/api/v1/tickets/${ticketId}/ai-suggestions`, {
      method: 'POST',
      body: JSON.stringify({ force })
    });
    return res.data;
  },
  list: async (ticketId, params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.append('page', params.page);
    if (params.limit) searchParams.append('limit', params.limit);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/api/v1/tickets/${ticketId}/ai-suggestions${query}`);
  },
  getById: async (id) => {
    const res = await request(`/api/v1/ai-suggestions/${id}`);
    return res.data;
  },
  review: async (id, { action, body, reason } = {}) => {
    const res = await request(`/api/v1/ai-suggestions/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, body, reason })
    });
    return res.data;
  },
  getSource: async (id, sourceId) => {
    const res = await request(`/api/v1/ai-suggestions/${id}/sources/${sourceId}`);
    return res.data;
  }
};

export const api = {
  get: async (path, options = {}) => {
    let url = path;
    if (options.params) {
      const searchParams = new URLSearchParams();
      for (const [key, val] of Object.entries(options.params)) {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, val);
        }
      }
      const q = searchParams.toString();
      if (q) url = `${url}${url.includes('?') ? '&' : '?'}${q}`;
    }
    const res = await request(url, { ...options, method: 'GET' });
    return { data: res };
  },
  post: async (path, body, options = {}) => {
    const reqBody = body instanceof FormData ? body : JSON.stringify(body);
    const res = await request(path, { ...options, method: 'POST', body: reqBody });
    return { data: res };
  },
  put: async (path, body, options = {}) => {
    const reqBody = body instanceof FormData ? body : JSON.stringify(body);
    const res = await request(path, { ...options, method: 'PUT', body: reqBody });
    return { data: res };
  },
  patch: async (path, body, options = {}) => {
    const reqBody = body instanceof FormData ? body : JSON.stringify(body);
    const res = await request(path, { ...options, method: 'PATCH', body: reqBody });
    return { data: res };
  },
  delete: async (path, options = {}) => {
    const res = await request(path, { ...options, method: 'DELETE' });
    return { data: res };
  }
};
