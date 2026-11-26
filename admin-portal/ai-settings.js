document.addEventListener('DOMContentLoaded', () => {
  // Adjust this URL to match your backend in production
    const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://nutrition-workout-system-production.up.railway.app';
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  if (!token) {
    alert('Please log in as an admin to access this page.');
    window.location.href = 'index.html';
    return;
  }

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Fetch and Render Metrics
  async function loadMetrics() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/ai/admin/metrics`, { headers });
      const data = await res.json();
      if (data.success) {
        renderMetrics(data.data);
      } else {
        document.getElementById('metrics-grid').innerHTML = `<p style="color:red;">Failed to load metrics: ${data.message}</p>`;
      }
    } catch (err) {
      console.error('Error fetching metrics:', err);
      document.getElementById('metrics-grid').innerHTML = `<p style="color:red;">Error connecting to backend.</p>`;
    }
  }

  function renderMetrics(metrics) {
    const grid = document.getElementById('metrics-grid');
    grid.innerHTML = '';
    
    const providerNames = { custom: 'Custom Trained AI', groq: 'Groq', gemini: 'Google Gemini' };
    
    metrics.forEach(m => {
      const card = document.createElement('div');
      card.className = 'metric-card';
      card.innerHTML = `
        <h3>${providerNames[m.provider] || m.provider}</h3>
        <div class="metric-stat">${m.request_count}</div>
        <div class="metric-label">Total Requests</div>
        <div style="margin-top:15px; display:flex; justify-content:space-around;">
          <div>
            <div style="font-size:18px; font-weight:bold; color:${m.error_count > 0 ? '#dc3545' : '#28a745'}">${m.error_rate}</div>
            <div class="metric-label">Error Rate</div>
          </div>
          <div>
            <div style="font-size:18px; font-weight:bold; color:#007bff">${m.avg_response_time_ms}ms</div>
            <div class="metric-label">Avg Speed</div>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // 2. Handle Configuration Save
  document.getElementById('ai-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('config-message');
    msgEl.className = 'message';
    msgEl.textContent = 'Saving...';
    msgEl.style.display = 'block';

    const defaultProvider = document.getElementById('default-provider').value;
    const enabledCheckboxes = document.querySelectorAll('input[name="enabled_providers"]:checked');
    const enabledProviders = Array.from(enabledCheckboxes).map(cb => cb.value);

    if (enabledProviders.length === 0) {
      msgEl.textContent = 'You must enable at least one provider.';
      msgEl.classList.add('error');
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/ai/admin/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ default_provider: defaultProvider, enabled_providers: enabledProviders })
      });
      const data = await res.json();
      
      if (data.success) {
        msgEl.textContent = 'Configuration saved successfully!';
        msgEl.classList.add('success');
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      msgEl.textContent = `Error: ${err.message}`;
      msgEl.classList.add('error');
    }
  });

  // Initial Load
  loadMetrics();
});