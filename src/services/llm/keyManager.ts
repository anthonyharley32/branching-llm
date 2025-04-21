/**
 * Key Manager for LLM Services
 * Securely manages API keys for different LLM providers
 */

import { LLMProvider } from './config';

/**
 * Prefix for storing keys in local storage to avoid collisions.
 */
const KEY_STORAGE_PREFIX = 'LearningLLM_llm_key_';

// Store API key securely
export function storeApiKey(provider: LLMProvider, apiKey: string): void {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key cannot be empty');
  }
  
  try {
    // In a production environment, consider using more secure methods
    // like browser's Web Crypto API for encryption before storage
    localStorage.setItem(`${KEY_STORAGE_PREFIX}${provider}`, apiKey);
  } catch (error: unknown) {
    console.error(`Failed to store API key for ${provider}:`, error);
    throw new Error(`Failed to store API key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Retrieve API key
export function getApiKey(provider: LLMProvider): string | null {
  try {
    // First try to get from environment variables (preferred)
    if (provider === LLMProvider.OPENAI && import.meta.env.VITE_OPENAI_API_KEY) {
      return import.meta.env.VITE_OPENAI_API_KEY;
    }
    
    // Check for OpenRouter key
    if (provider === LLMProvider.OPENROUTER && import.meta.env.VITE_OPENROUTER_API_KEY) {
      return import.meta.env.VITE_OPENROUTER_API_KEY;
    }
    
    // Fall back to localStorage if not in environment
    return localStorage.getItem(`${KEY_STORAGE_PREFIX}${provider}`);
  } catch (error: unknown) {
    console.error(`Failed to retrieve API key for ${provider}:`, error);
    throw new Error(`Failed to retrieve API key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Check if API key exists
export function hasApiKey(provider: LLMProvider): boolean {
  // First check environment variables
  if (provider === LLMProvider.OPENAI && import.meta.env.VITE_OPENAI_API_KEY) {
    return true;
  }
  
  // Check for OpenRouter key
  if (provider === LLMProvider.OPENROUTER && import.meta.env.VITE_OPENROUTER_API_KEY) {
    return true;
  }
  
  // Then check localStorage
  try {
    const key = localStorage.getItem(`${KEY_STORAGE_PREFIX}${provider}`);
    return key !== null && key.trim() !== '';
  } catch (error: unknown) {
    console.error(`Failed to check API key for ${provider}:`, error);
    return false;
  }
}

// Remove API key
export function removeApiKey(provider: LLMProvider): void {
  try {
    localStorage.removeItem(`${KEY_STORAGE_PREFIX}${provider}`);
  } catch (error: unknown) {
    console.error(`Failed to remove API key for ${provider}:`, error);
    throw new Error(`Failed to remove API key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Validate API key format
export function validateApiKeyFormat(provider: LLMProvider, apiKey: string): boolean {
  if (!apiKey || apiKey.trim() === '') {
    return false;
  }
  
  // Basic validation patterns by provider
  switch (provider) {
    case LLMProvider.OPENAI:
      // OpenAI keys typically start with "sk-" and are 51 characters long
      return /^sk-[a-zA-Z0-9]{48}$/.test(apiKey);
    case LLMProvider.OPENROUTER:
      // OpenRouter keys start with "sk-or-v1-" and are 64 characters long
      return /^sk-or-v1-[a-zA-Z0-9]{40,}$/.test(apiKey);
    default:
      // For unknown providers, just check it's not empty
      return apiKey.trim().length > 0;
  }
} 