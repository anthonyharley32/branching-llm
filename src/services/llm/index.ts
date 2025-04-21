/**
 * LLM Service - Main Interface
 * Provides a unified interface to LLM providers
 */

import { Message } from '../../types/chat';
import { config, LLMProvider } from './config';

// Import providers
import * as OpenAIProvider from './openai';
import * as OpenRouterProvider from './openrouter';

// Common error type definition
export enum ErrorType {
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  UNKNOWN = 'unknown',
}

export interface LLMError {
  type: ErrorType;
  message: string;
  statusCode?: number;
  original?: any;
}

// Interface for streaming callbacks
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: LLMError) => void;
}

// Initialize the appropriate client based on active provider
export function initializeClient(): void {
  const provider = config.activeProvider;
  
  switch (provider) {
    case LLMProvider.OPENAI:
      OpenAIProvider.initializeClient();
      break;
    case LLMProvider.OPENROUTER:
      OpenRouterProvider.initializeClient();
      break;
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Generate completion with the currently active provider
export async function generateCompletion(messages: Message[]): Promise<string> {
  const provider = config.activeProvider;
  
  switch (provider) {
    case LLMProvider.OPENAI:
      return await OpenAIProvider.generateCompletion(messages);
    case LLMProvider.OPENROUTER:
      return await OpenRouterProvider.generateCompletion(messages);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Generate streaming completion with the currently active provider
export async function generateCompletionStream(
  messages: Message[],
  callbacks: StreamCallbacks
): Promise<void> {
  const provider = config.activeProvider;
  
  switch (provider) {
    case LLMProvider.OPENAI:
      return await OpenAIProvider.generateCompletionStream(messages, callbacks);
    case LLMProvider.OPENROUTER:
      return await OpenRouterProvider.generateCompletionStream(messages, callbacks);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Generate title using the currently active provider
export async function generateTitle(
  userMessage: string,
  maxRetries: number = 3,
  defaultTitle: string = "New Chat"
): Promise<string> {
  const provider = config.activeProvider;
  
  switch (provider) {
    case LLMProvider.OPENAI:
      return await OpenAIProvider.generateTitle(userMessage, maxRetries, defaultTitle);
    case LLMProvider.OPENROUTER:
      return await OpenRouterProvider.generateTitle(userMessage, maxRetries, defaultTitle);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Set the active LLM provider
export function setProvider(provider: LLMProvider): void {
  // Update the config
  config.activeProvider = provider;
  
  // Re-initialize the client
  try {
    initializeClient();
    console.log(`LLM provider switched to: ${provider}`);
  } catch (error) {
    console.error(`Failed to initialize ${provider} provider:`, error);
    throw error;
  }
}

// Get the current active provider
export function getActiveProvider(): LLMProvider {
  return config.activeProvider;
}

// Get available models for the current provider
export function getAvailableModels(): string[] {
  const provider = config.activeProvider;
  
  switch (provider) {
    case LLMProvider.OPENAI:
      return [
        'gpt-3.5-turbo',
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4.1'
      ];
    case LLMProvider.OPENROUTER:
      return [
        'openai/gpt-3.5-turbo',
        'openai/gpt-4',
        'openai/gpt-4o',
        'anthropic/claude-3-opus-20240229',
        'anthropic/claude-3-sonnet-20240229',
        'meta-llama/llama-3-70b-chat',
        'mistral/mistral-large-latest'
      ];
    default:
      return [];
  }
}

// Interface for model with provider information
export interface ModelInfo {
  id: string;
  name: string;
  provider: LLMProvider;
  providerName: string;
  fullId: string;
}

// Get all available models from all providers
export function getAllModels(): ModelInfo[] {
  const models: ModelInfo[] = [];
  
  // Add OpenAI models
  const openaiModels = [
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4.1', name: 'GPT-4.1' }
  ];
  
  openaiModels.forEach(model => {
    models.push({
      id: model.id,
      name: model.name,
      provider: LLMProvider.OPENAI,
      providerName: 'OpenAI',
      fullId: model.id
    });
  });
  
  // Add OpenRouter models
  const openRouterModels = [
    // OpenAI models through OpenRouter
    { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', providerName: 'OpenAI' },
    { id: 'openai/gpt-4', name: 'GPT-4', providerName: 'OpenAI' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', providerName: 'OpenAI' },
    
    // Anthropic models
    { id: 'anthropic/claude-3-opus-20240229', name: 'Claude 3 Opus', providerName: 'Anthropic' },
    { id: 'anthropic/claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', providerName: 'Anthropic' },
    { id: 'anthropic/claude-3-haiku-20240307', name: 'Claude 3 Haiku', providerName: 'Anthropic' },
    
    // Meta models
    { id: 'meta-llama/llama-3-70b-chat', name: 'Llama 3 70B', providerName: 'Meta' },
    { id: 'meta-llama/llama-3-8b-chat', name: 'Llama 3 8B', providerName: 'Meta' },
    
    // Mistral models
    { id: 'mistral/mistral-large-latest', name: 'Mistral Large', providerName: 'Mistral' },
    { id: 'mistral/mistral-medium-latest', name: 'Mistral Medium', providerName: 'Mistral' },
    { id: 'mistral/mistral-small-latest', name: 'Mistral Small', providerName: 'Mistral' },
    
    // Google models
    { id: 'google/gemini-pro', name: 'Gemini Pro', providerName: 'Google' },
    { id: 'google/gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', providerName: 'Google' }
  ];
  
  openRouterModels.forEach(model => {
    models.push({
      id: model.id.split('/')[1],
      name: model.name,
      provider: LLMProvider.OPENROUTER,
      providerName: model.providerName,
      fullId: model.id
    });
  });
  
  return models;
}

// Set the model for the current provider
export function setModel(model: string): void {
  const provider = config.activeProvider;
  
  switch (provider) {
    case LLMProvider.OPENAI:
      config.model = model;
      break;
    case LLMProvider.OPENROUTER:
      config.openRouterModel = model;
      break;
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
  
  console.log(`Model switched to: ${model}`);
}

// Get the current model
export function getCurrentModel(): string {
  const provider = config.activeProvider;
  
  switch (provider) {
    case LLMProvider.OPENAI:
      return config.model;
    case LLMProvider.OPENROUTER:
      return config.openRouterModel;
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Export the error types
export { LLMProvider }; 