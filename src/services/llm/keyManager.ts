/**
 * Key Management Module
 * Handles API key storage, retrieval, and validation
 */

import { LLMProvider } from './config';

// Storage keys
const STORAGE_PREFIX = 'llm-app';
const getStorageKey = (provider: LLMProvider) => `${STORAGE_PREFIX}.${provider}.api_key`;

/**
 * Check if an API key is configured via environment variables or browser storage
 */
export function hasApiKey(provider: LLMProvider): boolean {
  switch (provider) {
    case LLMProvider.OPENROUTER:
      // Check environment variables first (for development)
      if (import.meta.env.VITE_OPENROUTER_API_KEY) {
        return true;
      }
      
      // Check browser storage
      const key = localStorage.getItem(getStorageKey(provider));
      return key !== null && key.trim() !== '';
      
    default:
      return false;
  }
}

/**
 * Get the API key for the specified provider
 */
export function getApiKey(provider: LLMProvider): string | null {
  switch (provider) {
    case LLMProvider.OPENROUTER:
      // Check environment variables first (for development)
      if (import.meta.env.VITE_OPENROUTER_API_KEY) {
        return import.meta.env.VITE_OPENROUTER_API_KEY;
      }
      
      // Fall back to browser storage
      return localStorage.getItem(getStorageKey(provider));
      
    default:
      return null;
  }
}

/**
 * Save the API key for the specified provider
 */
export function saveApiKey(provider: LLMProvider, key: string): void {
  if (!key || key.trim() === '') {
    throw new Error('API key cannot be empty');
  }
  
  localStorage.setItem(getStorageKey(provider), key.trim());
  
  // Log success (but don't log the actual key)
  console.log(`Saved API key for ${provider}`);
}

/**
 * Remove the stored API key for the specified provider
 */
export function removeApiKey(provider: LLMProvider): void {
  localStorage.removeItem(getStorageKey(provider));
  console.log(`Removed API key for ${provider}`);
}

/**
 * Get a display-friendly name for the provider
 */
export function getProviderDisplayName(provider: LLMProvider): string {
  switch (provider) {
    case LLMProvider.OPENROUTER:
      return 'OpenRouter';
    default:
      return 'Unknown Provider';
  }
}

/**
 * Validate API key format
 * Returns boolean indicating if the key appears to be valid
 */
export function validateApiKey(provider: LLMProvider, apiKey: string): boolean {
  if (!apiKey || apiKey.trim() === '') {
    return false;
  }
  
  switch (provider) {
    case LLMProvider.OPENROUTER:
      // OpenRouter keys are 32 character alphanumeric strings
      return /^[a-zA-Z0-9_-]{32,}$/.test(apiKey.trim());
    default:
      // For any unknown provider, just check it's not empty
      return apiKey.trim().length > 0;
  }
} 