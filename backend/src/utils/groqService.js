/**
 * groqService.js
 * High-speed inference connector for Groq LPU Cloud (Tier 2 Secondary Fallback).
 * Targets OpenAI-compatible chat completion endpoint: https://api.groq.com/openai/v1/chat/completions
 * Provides sub-500ms responses with structured JSON output and circuit-breaker timeout.
 */

const axios = require('axios');

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 6000; // 6s circuit-breaker timeout

/**
 * Checks whether Groq API key is configured
 * @returns {boolean}
 */
function isAvailable() {
  const key = process.env.GROQ_API_KEY;
  return Boolean(key && key.trim().length > 10 && key.startsWith('gsk_'));
}

/**
 * Execute chat completion on Groq LPU with JSON mode enforcement and automatic model resilience
 * @param {Object} options
 * @param {string} options.systemPrompt - Instructions and JSON schema
 * @param {string} options.userPrompt - Incident context and data
 * @param {string} [options.model] - Optional model override
 * @param {boolean} [options.jsonMode=true] - Enforce JSON response format
 * @returns {Promise<Object>} Parsed JSON response from Groq
 */
async function chatCompletion({
  systemPrompt,
  userPrompt,
  model,
  jsonMode = true
}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in environment or .env');
  }

  const messages = [
    { role: 'system', content: systemPrompt || 'You are an emergency response AI agent. Respond in valid JSON.' },
    { role: 'user', content: userPrompt }
  ];

  // Candidates in priority order
  const candidates = [
    model,
    process.env.GROQ_MODEL,
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b'
  ].filter((m, idx, self) => Boolean(m) && self.indexOf(m) === idx);

  let lastErr = null;

  for (const candidateModel of candidates) {
    try {
      const payload = {
        model: candidateModel,
        messages,
        temperature: 0.1, // Deterministic precision for municipal decisions
        max_tokens: 1024
      };

      if (jsonMode) {
        payload.response_format = { type: 'json_object' };
      }

      const response = await axios.post(GROQ_ENDPOINT, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUT_MS
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Groq returned empty response content');
      }

      if (jsonMode) {
        try {
          const cleanJson = content.replace(/```json/gi, '').replace(/```/g, '').trim();
          return JSON.parse(cleanJson);
        } catch (parseErr) {
          console.warn('[groqService] Failed to parse JSON, returning raw text:', parseErr.message);
          return { raw: content };
        }
      }

      return { text: content };
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const errCode = err.response?.data?.error?.code;
      // If 404 or model_not_found, try next candidate
      if (status === 404 || errCode === 'model_not_found') {
        console.warn(`[groqService] Model ${candidateModel} not available (404), trying next candidate...`);
        continue;
      }
      // Otherwise rethrow immediately (e.g. invalid key 401, timeout, etc.)
      throw err;
    }
  }

  throw lastErr || new Error('All Groq model candidates failed');
}

module.exports = {
  chatCompletion,
  isAvailable,
  DEFAULT_MODEL
};
