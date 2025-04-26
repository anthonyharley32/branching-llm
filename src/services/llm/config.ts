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
  // API key is stored securely in Edge Function environment
  openRouterModel: string;
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
  // API key is stored securely in Edge Function environment
  openRouterModel: 'openai/gpt-4.1', // Default model
}; 