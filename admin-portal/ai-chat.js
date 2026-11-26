class AIChatAssistant {
  constructor(containerId, apiUrl) {
    this.container = document.getElementById(containerId);
    this.apiUrl = apiUrl;
    this.conversationId = null;
    
    // DOM Elements
    this.messagesContainer = this.container.querySelector('.ai-chat-messages');
    this.input = this.container.querySelector('.ai-chat-input');
    this.sendBtn = this.container.querySelector('.ai-chat-send-btn');
    this.typingIndicator = this.container.querySelector('.ai-typing-indicator');
    this.errorMsg = this.container.querySelector('.ai-error-message');
    this.providerSelect = this.container.querySelector('.ai-provider-select');
    
    this.bindEvents();
  }

  bindEvents() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  appendMessage(role, text, provider = null, responseTimeMs = null) {
    const div = document.createElement('div');
    div.className = `ai-message ${role}`;
    
    let badge = '';
    if (role === 'assistant' && provider) {
      const providerNames = { custom: 'Custom AI', groq: 'Groq', gemini: 'Gemini' };
      const timeStr = responseTimeMs ? ` • ${responseTimeMs}ms` : '';
      badge = `<div class="ai-badge">${providerNames[provider] || provider}${timeStr}</div>`;
    }

    // Basic markdown-like newline handling
    div.innerHTML = `${badge}<div class="ai-text">${text.replace(/\n/g, '<br>')}</div>`;
    this.messagesContainer.appendChild(div);
    this.scrollToBottom();
  }

  appendComparisonResults(results) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-comparison-wrapper';
    wrapper.innerHTML = '<div class="comparison-header">Multi-AI Comparison Results</div>';

    results.forEach(res => {
      const bubble = document.createElement('div');
      bubble.className = `ai-message assistant comparison-bubble ${res.success ? '' : 'error'}`;
      
      if (res.success) {
        const providerNames = { custom: 'Custom AI', groq: 'Groq', gemini: 'Gemini' };
        const badge = `<div class="ai-badge">${providerNames[res.provider]} • ${res.responseTimeMs}ms</div>`;
        bubble.innerHTML = `${badge}<div class="ai-text">${res.response.replace(/\n/g, '<br>')}</div>`;
      } else {
        bubble.innerHTML = `<div class="ai-badge" style="background:#ffebee; color:#c62828;">Error</div><div class="ai-text error-text">${res.error || 'Failed to generate response'}</div>`;
      }
      wrapper.appendChild(bubble);
    });

    this.messagesContainer.appendChild(wrapper);
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  setLoading(isLoading) {
    this.sendBtn.disabled = isLoading;
    this.input.disabled = isLoading;
    this.providerSelect.disabled = isLoading;
    this.typingIndicator.style.display = isLoading ? 'block' : 'none';
    this.errorMsg.style.display = 'none';
    if (isLoading) this.scrollToBottom();
  }

  async sendMessage() {
    const text = this.input.value.trim();
    if (!text) return;

    const selectedProvider = this.providerSelect.value;
    const isCompare = selectedProvider === 'compare';

    // 1. Display user message
    this.appendMessage('user', text);
    this.input.value = '';
    this.setLoading(true);

    try {
      // 2. Get JWT token
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      
      // 3. Determine endpoint and payload
      const endpoint = isCompare ? '/api/ai/compare' : '/api/ai/chat';
      const payload = {
        message: text,
        conversation_id: this.conversationId
      };
      
      // If not comparing and not on 'auto', specify the provider
      if (!isCompare && selectedProvider !== 'auto') {
        payload.provider = selectedProvider;
      }

      // 4. Send request
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to get AI response');
      }

      // 5. Save conversation ID for continuity
      this.conversationId = data.conversation_id;

      // 6. Render response(s)
      if (isCompare) {
        this.appendComparisonResults(data.results);
      } else {
        // The backend now returns 'provider' and we can optionally track responseTimeMs if added to the chat response
        this.appendMessage('assistant', data.response, data.provider, data.responseTimeMs || null);
      }

    } catch (error) {
      console.error('Chat error:', error);
      this.errorMsg.textContent = error.message || 'An error occurred. Please try again.';
      this.errorMsg.style.display = 'block';
    } finally {
      this.setLoading(false);
      this.input.focus();
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Adjust this URL to match your backend in production
  const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://nutrition-workout-system-production.up.railway.app';

  window.aiChat = new AIChatAssistant('ai-chat-widget', BACKEND_URL);
});