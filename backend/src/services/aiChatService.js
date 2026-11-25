const axios = require('axios');
const pool = require('../config/db');
const crypto = require('crypto');

const PYTHON_AI_API_URL = process.env.PYTHON_AI_API_URL || 'http://localhost:8000';

async function sendToPythonAI(userId, message, conversationHistory, userContext, endpoint = '/api/ai/chat') {
  try {
    const response = await axios.post(
      `${PYTHON_AI_API_URL}${endpoint}`,
      {
        message,
        user_id: userId,
        conversation_history: conversationHistory,
        user_context: userContext
      },
      {
        timeout: 30000, // 30 seconds max wait time
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Python AI API Error:', error.response?.data || error.message);
    throw new Error('AI service is currently unavailable or timed out.');
  }
}

async function saveConversation(userId, conversationId, role, message, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO ai_conversations (user_id, conversation_id, role, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, conversationId, role, message, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('Failed to save conversation:', error.message);
  }
}

async function getConversationHistory(userId, conversationId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT role, message, created_at 
       FROM ai_conversations 
       WHERE user_id = $1 AND conversation_id = $2 
       ORDER BY created_at ASC 
       LIMIT $3`,
      [userId, conversationId, limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Failed to get conversation history:', error.message);
    return [];
  }
}

module.exports = {
  sendToPythonAI,
  saveConversation,
  getConversationHistory,
  generateConversationId: () => crypto.randomUUID()
};