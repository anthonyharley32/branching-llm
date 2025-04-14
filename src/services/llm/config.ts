/**
 * LLM Service Configuration
 * Simple configuration for OpenAI
 */

// Default configuration settings for OpenAI
export const config = {
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  model: 'gpt-4.1-mini',
  temperature: 0.7,
  maxTokens: 2048,
}; 