    /* Shared API helper for all admin portal pages.
   - Resolves the correct backend URL for dev vs. production.
   - Automatically attaches the JWT token from localStorage.
   - Centralizes error handling. */

const API_BASE_URL =
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://nutrition-workout-system-production.up.railway.app';

function getToken() {
  return localStorage.getItem('token');
}

// Redirect to login if there's no token (protects every admin page)
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'index.html';
  }
}

/**
 * apiFetch('/api/exercises')  →  http://localhost:5000/api/exercises
 * Adds Authorization header + JSON content type automatically.
 */
async function apiFetch(path, options = {}) {
  requireAuth();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // If token expired / invalid, kick back to login
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
    throw new Error('Session expired. Please log in again.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}