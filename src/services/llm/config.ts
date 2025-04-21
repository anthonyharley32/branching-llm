/**
 * LLM Configuration Module
 * Manages configuration for LLM providers
 */

// Enum for supported LLM providers
export enum LLMProvider {
  OPENROUTER = 'openrouter'
}

// Configuration interface
interface LLMConfig {
  // Global settings
  activeProvider: LLMProvider;
  systemPrompt: string;  
  temperature: number;
  maxTokens: number;
  isStreaming: boolean;
  
  // OpenRouter specific settings
  openRouterApiKey: string | null;
  openRouterModel: string;

  // OpenAI specific settings
  openaiApiKey: string | null;
  openaiModel: string;
}

// Default configuration
export const config: LLMConfig = {
  // Global settings
  activeProvider: LLMProvider.OPENROUTER,
  systemPrompt: "You are a helpful AI assistant. Answer the user's questions accurately and concisely.",
  temperature: 0.7,
  maxTokens: 1024,
  isStreaming: true,
  
  // OpenRouter specific config
  openRouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY || null,
  openRouterModel: 'openai/gpt-4.1', // Default to Claude

  // OpenAI specific config
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY || null,
  openaiModel: 'gpt-4-turbo', // Example default OpenAI model
}; 