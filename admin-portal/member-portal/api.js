/**
 * Centralized API Helper for Member Portal
 */

// 1. SMART API SWITCHING
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocalhost 
  ? 'http://localhost:5000/api' 
  : 'https://nutrition-workout-system-production.up.railway.app/api';

// 2. SESSION MANAGEMENT
function getToken() { return localStorage.getItem('token'); }

function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } 
  catch { return null; }
}

function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// 3. HEADERS
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getToken()
  };
}

// 4. CORE FETCH WITH SAFETY CHECKS
async function apiFetch(path, options = {}) {
  const headers = { ...authHeaders(), ...(options.headers || {}) };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  
  // Prevent "Unexpected token '<'" crashes if backend returns HTML error page
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await res.text();
    console.error('Non-JSON response from', `${API_BASE}${path}`, ':', text.substring(0, 200));
    throw new Error('Server error. Check if backend is running on port 5000.');
  }

  const data = await res.json();

  if (res.status === 401) {
    clearSession();
    window.location.href = 'index.html';
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  return data;
}

// 5. CONVENIENCE WRAPPERS
async function apiGet(path) { return apiFetch(path, { method: 'GET' }); }
async function apiPost(path, body) { return apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(path, body) { return apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }); }
async function apiDelete(path) { return apiFetch(path, { method: 'DELETE' }); }