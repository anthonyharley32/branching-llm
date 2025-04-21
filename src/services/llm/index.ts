/**
 * LLM Service - Main Interface
 * Provides a unified interface to LLM providers
 */

import { Message } from '../../types/chat';
import { config, LLMProvider } from './config';

// Import providers
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
    case LLMProvider.OPENROUTER:
      return [
        'openai/gpt-4.1',
        'openai/o4-mini-high',
        'google/gemini-2.5-flash-preview',
        'google/gemini-2.5-pro-preview-03-25',
        'anthropic/claude-3.7-sonnet',
        'anthropic/claude-3.7-sonnet:thinking',
        'x-ai/grok-3-mini-beta',
        'x-ai/grok-3-beta'
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
  
  // Add OpenRouter models
  const openRouterModels = [
    // OpenAI models through OpenRouter
    { id: 'openai/gpt-4.1', name: 'GPT-4.1', providerName: 'OpenAI' },
    { id: 'openai/o4-mini-high', name: 'o4 Mini High', providerName: 'OpenAI' },
    
    // Google models
    { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash Preview', providerName: 'Google' },
    { id: 'google/gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro Preview', providerName: 'Google' },
    
    // Anthropic models
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', providerName: 'Anthropic' },
    { id: 'anthropic/claude-3.7-sonnet:thinking', name: 'Claude 3.7 Sonnet (Thinking)', providerName: 'Anthropic' },
    
    // xAI models
    { id: 'x-ai/grok-3-mini-beta', name: 'Grok 3 Mini Beta', providerName: 'xAI' },
    { id: 'x-ai/grok-3-beta', name: 'Grok 3 Beta', providerName: 'xAI' }
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
    case LLMProvider.OPENROUTER:
      return config.openRouterModel;
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Export the error types
export { LLMProvider }; 