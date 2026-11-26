/**
 * Member-portal AI Chat — uses shared api.js / token storage
 * and the centralized /api/ai/* backend routes.
 */
class AIChatAssistant {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.conversationId = null;

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

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  appendMessage(role, text, provider = null, responseTimeMs = null) {
    const div = document.createElement('div');
    div.className = `ai-message ${role}`;

    let badge = '';
    if (role === 'assistant' && provider) {
      const providerNames = { custom: 'Custom AI', groq: 'Groq', gemini: 'Gemini', auto: 'Auto' };
      const timeStr = responseTimeMs ? ` • ${responseTimeMs}ms` : '';
      badge = `<div class="ai-badge">${providerNames[provider] || provider}${timeStr}</div>`;
    }

    const safe = this.escapeHtml(text).replace(/\n/g, '<br>');
    div.innerHTML = `${badge}<div class="ai-text">${safe}</div>`;
    this.messagesContainer.appendChild(div);
    this.scrollToBottom();
  }

  appendComparisonResults(results) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-comparison-wrapper';
    wrapper.innerHTML = '<div class="comparison-header">Multi-AI Comparison Results</div>';

    (results || []).forEach(res => {
      const bubble = document.createElement('div');
      bubble.className = `ai-message assistant comparison-bubble ${res.success ? '' : 'error'}`;
      if (res.success) {
        const providerNames = { custom: 'Custom AI', groq: 'Groq', gemini: 'Gemini' };
        const badge = `<div class="ai-badge">${providerNames[res.provider] || res.provider} • ${res.responseTimeMs || '—'}ms</div>`;
        bubble.innerHTML = `${badge}<div class="ai-text">${this.escapeHtml(res.response || '').replace(/\n/g, '<br>')}</div>`;
      } else {
        bubble.innerHTML = `<div class="ai-badge" style="background:#ffebee;color:#c62828;">Error</div><div class="ai-text error-text">${this.escapeHtml(res.error || 'Failed')}</div>`;
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
    if (this.providerSelect) this.providerSelect.disabled = isLoading;
    if (this.typingIndicator) this.typingIndicator.style.display = isLoading ? 'block' : 'none';
    if (this.errorMsg) this.errorMsg.style.display = 'none';
    if (isLoading) this.scrollToBottom();
  }

  async sendMessage() {
    const text = this.input.value.trim();
    if (!text) return;

    const selectedProvider = this.providerSelect ? this.providerSelect.value : 'auto';
    const isCompare = selectedProvider === 'compare';

    this.appendMessage('user', text);
    this.input.value = '';
    this.setLoading(true);

    try {
      const path = isCompare ? '/ai/compare' : '/ai/chat';
      const payload = {
        message: text,
        conversation_id: this.conversationId
      };
      if (!isCompare && selectedProvider !== 'auto') {
        payload.provider = selectedProvider;
      }

      const data = await apiPost(path, payload);

      if (data.conversation_id) this.conversationId = data.conversation_id;

      if (isCompare) {
        this.appendComparisonResults(data.results || data.data);
      } else {
        const responseText = data.response || (data.data && data.data.response) || 'No response.';
        this.appendMessage('assistant', responseText, data.provider || selectedProvider, data.responseTimeMs || null);
      }
    } catch (error) {
      console.error('Chat error:', error);
      if (this.errorMsg) {
        this.errorMsg.textContent = error.message || 'An error occurred. Please try again.';
        this.errorMsg.style.display = 'block';
      }
    } finally {
      this.setLoading(false);
      this.input.focus();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof getToken !== 'function' || !getToken() || !getUser()) {
    window.location.href = 'index.html';
    return;
  }
  window.aiChat = new AIChatAssistant('ai-chat-widget');
});