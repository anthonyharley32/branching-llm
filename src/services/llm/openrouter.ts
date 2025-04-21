/**
 * OpenRouter API Integration
 * Provides a unified interface to multiple LLM providers
 */

import { config } from './config';
import { Message } from '../../types/chat';

// Error types (reused from openai.ts)
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

// OpenRouter API base URL
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

// Convert our message format to OpenRouter format
function convertToOpenRouterMessages(messages: Message[]): any[] {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

// Initialize OpenRouter
export function initializeClient(): void {
  if (!config.openRouterApiKey) {
    throw new Error('OpenRouter API key is required but not provided');
  }
  
  // No client instance needed for fetch API
  console.log('OpenRouter client initialized');
}

// Generate completion using OpenRouter API
export async function generateCompletion(
  messages: Message[]
): Promise<string> {
  try {
    if (!config.openRouterApiKey) {
      throw new Error('OpenRouter API key is not configured');
    }
    
    const systemMessage = { role: 'system' as const, content: config.systemPrompt };
    const openRouterMessages = [systemMessage, ...convertToOpenRouterMessages(messages)];
    
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin, // for OpenRouter analytics
        'X-Title': 'Learning LLM App' // for OpenRouter analytics
      },
      body: JSON.stringify({
        model: config.openRouterModel,
        messages: openRouterMessages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: false,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw handleApiError(response.status, errorData);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
    
  } catch (error: unknown) {
    console.error('Error generating completion from OpenRouter:', error);
    const llmError = parseError(error);
    throw llmError;
  }
}

// Generate a chat completion from OpenRouter, streaming the response
export async function generateCompletionStream(
  messages: Message[],
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    if (!config.openRouterApiKey) {
      throw new Error('OpenRouter API key is not configured');
    }
    
    const systemMessage = { role: 'system' as const, content: config.systemPrompt };
    const openRouterMessages = [systemMessage, ...convertToOpenRouterMessages(messages)];
    
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin, // for OpenRouter analytics
        'X-Title': 'Learning LLM App' // for OpenRouter analytics
      },
      body: JSON.stringify({
        model: config.openRouterModel,
        messages: openRouterMessages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw handleApiError(response.status, errorData);
    }
    
    if (!response.body) {
      throw new Error('Response body is null');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk
        .split('\n')
        .filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            const content = data.choices[0]?.delta?.content;
            if (content) {
              callbacks.onChunk(content);
            }
          } catch (e) {
            console.warn('Error parsing SSE chunk:', e);
          }
        }
      }
    }
    
    if (callbacks.onComplete) {
      callbacks.onComplete();
    }
    
  } catch (error: unknown) {
    console.error('Error generating completion stream from OpenRouter:', error);
    const llmError = parseError(error);
    
    if (callbacks.onError) {
      callbacks.onError(llmError);
    } else {
      throw llmError;
    }
  }
}

// Function to generate a concise conversation title
export async function generateTitle(
  userMessage: string, 
  maxRetries: number = 3,
  defaultTitle: string = "New Chat"
): Promise<string> {
  const maxTitleLength = 30; // Maximum allowed title length
  
  const systemPrompt = `Summarize the following user message into a concise conversation title, maximum ${maxTitleLength} characters. Be brief and capture the main topic. Title:`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Learning LLM App'
        },
        body: JSON.stringify({
          model: 'openai/gpt-4-turbo', // Use a powerful model for title generation
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.5,
          max_tokens: 15,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw handleApiError(response.status, errorData);
      }
      
      const data = await response.json();
      const generatedTitle = data.choices[0]?.message?.content?.trim();
      
      if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= maxTitleLength) {
        return generatedTitle.replace(/^["']|["']$/g, '');
      } else {
        console.warn(`Title generation attempt ${attempt}: Title too long or empty ('${generatedTitle}'). Retrying...`);
      }
    } catch (error: unknown) {
      console.error(`Error generating title on attempt ${attempt}:`, error);
      const llmError = parseError(error);
      if (llmError.type === ErrorType.AUTHENTICATION || llmError.type === ErrorType.QUOTA_EXCEEDED) {
        console.error(`Unrecoverable error encountered (${llmError.type}), stopping title generation.`);
        break;
      }
    }
  }
  
  console.warn(`Failed to generate a valid title after ${maxRetries} attempts.`);
  return defaultTitle;
}

// Helper function to handle API errors
function handleApiError(status: number, data: any): Error {
  let errorMessage = data.error?.message || 'Unknown error occurred';
  let error = new Error(errorMessage);
  
  // Add additional properties
  (error as any).status = status;
  (error as any).data = data;
  
  return error;
}

// Parse and categorize OpenRouter errors
function parseError(error: unknown): LLMError {
  // Default error object
  const defaultError: LLMError = {
    type: ErrorType.UNKNOWN,
    message: 'An unknown error occurred',
    original: error,
  };
  
  // If it's not an Error object, return default
  if (!(error instanceof Error)) {
    return defaultError;
  }
  
  // If it's an API error with status
  if ('status' in error && typeof (error as any).status === 'number') {
    const status = (error as any).status;
    const message = error.message;
    
    // Categorize based on status code
    if (status === 401 || status === 403) {
      return {
        type: ErrorType.AUTHENTICATION,
        message: 'Invalid API key or authentication error',
        statusCode: status,
        original: error,
      };
    } else if (status === 429) {
      // Check if it's rate limit or quota
      if (message.includes('quota') || message.includes('billing')) {
        return {
          type: ErrorType.QUOTA_EXCEEDED,
          message: 'API quota exceeded. Please check your billing information.',
          statusCode: status,
          original: error,
        };
      } else {
        return {
          type: ErrorType.RATE_LIMIT,
          message: 'API rate limit exceeded. Please try again later.',
          statusCode: status,
          original: error,
        };
      }
    } else if (status >= 400 && status < 500) {
      return {
        type: ErrorType.INVALID_REQUEST,
        message: `Invalid request to API: ${message}`,
        statusCode: status,
        original: error,
      };
    } else if (status >= 500) {
      return {
        type: ErrorType.SERVER_ERROR,
        message: 'API server error. Please try again later.',
        statusCode: status,
        original: error,
      };
    }
  }
  
  // For any other errors
  return {
    type: ErrorType.UNKNOWN,
    message: error.message || defaultError.message,
    original: error,
  };
} 