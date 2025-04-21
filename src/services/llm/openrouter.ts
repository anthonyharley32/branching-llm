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

// Supported OpenRouter models
export const SUPPORTED_MODELS = {
  // OpenAI models
  'openai/gpt-4.1': 'GPT-4.1',
  'openai/o4-mini-high': 'OpenAI o4 Mini High',
  
  // Google models
  'google/gemini-2.5-flash-preview': 'Gemini 2.5 Flash Preview',
  'google/gemini-2.5-pro-preview-03-25': 'Gemini 2.5 Pro Preview',
  
  // Anthropic models
  'anthropic/claude-3.7-sonnet': 'Claude 3.7 Sonnet',
  'anthropic/claude-3.7-sonnet:thinking': 'Claude 3.7 Sonnet with Thinking',
  
  // xAI models
  'x-ai/grok-3-mini-beta': 'Grok 3 Mini Beta',
  'x-ai/grok-3-beta': 'Grok 3 Beta'
};

// OpenRouter API base URL
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

// Convert our message format to OpenRouter format
function convertToOpenRouterMessages(messages: Message[]): any[] {
  // Filter out any empty messages
  return messages
    .filter(msg => msg.content && msg.content.trim() !== '')
    .map(msg => ({
      role: msg.role,
      content: msg.content
    }));
}

// Validate that the configured model is supported
function validateModel(model: string): string {
  if (!model || !Object.keys(SUPPORTED_MODELS).includes(model)) {
    console.warn(`Unsupported model: ${model}. Defaulting to anthropic/claude-3.7-sonnet`);
    return 'anthropic/claude-3.7-sonnet';
  }
  return model;
}

// Initialize OpenRouter
export function initializeClient(): void {
  if (!config.openRouterApiKey) {
    throw new Error('OpenRouter API key is required but not provided');
  }
  
  // Validate the configured model
  const validModel = validateModel(config.openRouterModel);
  if (validModel !== config.openRouterModel) {
    console.warn(`Configured model ${config.openRouterModel} is not supported. Using ${validModel} instead.`);
    // Note: Ideally we would update config.openRouterModel here, but we're assuming it's readonly
  }
  
  console.log('OpenRouter client initialized');
}

// Get available models
export function getAvailableModels(): { id: string, name: string }[] {
  return Object.entries(SUPPORTED_MODELS).map(([id, name]) => ({ id, name }));
}

// Generate completion using OpenRouter API
export async function generateCompletion(
  messages: Message[]
): Promise<string> {
  try {
    if (!config.openRouterApiKey) {
      throw new Error('OpenRouter API key is not configured');
    }
    
    const model = validateModel(config.openRouterModel);
    const systemMessage = { role: 'system' as const, content: config.systemPrompt };
    const openRouterMessages = [systemMessage, ...convertToOpenRouterMessages(messages)];
    
    // Add special params for Grok models
    const requestBody: any = {
      model: model,
      messages: openRouterMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
    };
    
    // Add reasoning parameter for Grok models
    if (model.startsWith('x-ai/grok-')) {
      requestBody.reasoning = { effort: "high" };
    }
    
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin, // for OpenRouter analytics
        'X-Title': 'Learning LLM App' // for OpenRouter analytics
      },
      body: JSON.stringify(requestBody),
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
  callbacks: StreamCallbacks,
  additionalSystemPrompt: string | null
): Promise<void> {
  try {
    if (!config.openRouterApiKey) {
      throw new Error('OpenRouter API key is not configured');
    }
    
    const model = validateModel(config.openRouterModel);
    
    // Combine system prompts
    const combinedSystemPrompt = config.systemPrompt + 
      (additionalSystemPrompt ? `\n\n${additionalSystemPrompt}` : '');
      
    const systemMessage = { role: 'system' as const, content: combinedSystemPrompt };
    const openRouterMessages = [systemMessage, ...convertToOpenRouterMessages(messages)];
    
    // Special validation for Grok models which are sensitive to empty messages
    if (model.startsWith('x-ai/grok-')) {
      // Check if we have at least one non-system message
      const hasNonSystemMessage = openRouterMessages.some(msg => 
        msg.role !== 'system' && msg.content && msg.content.trim() !== '');
      
      if (!hasNonSystemMessage) {
        throw new Error('Grok models require at least one non-empty user message');
      }
      
      // Check for any empty messages (shouldn't happen due to our filter, but just in case)
      const emptyMessages = openRouterMessages.filter(msg => !msg.content || msg.content.trim() === '');
      if (emptyMessages.length > 0) {
        throw new Error('Grok models do not support empty messages');
      }
    }
    
    // Add special params for Grok models
    const requestBody: any = {
      model: model,
      messages: openRouterMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    };
    
    // Add reasoning parameter for Grok models
    if (model.startsWith('x-ai/grok-')) {
      requestBody.reasoning = { effort: "high" };
    }
    
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin, // for OpenRouter analytics
        'X-Title': 'Learning LLM App' // for OpenRouter analytics
      },
      body: JSON.stringify(requestBody),
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
            const jsonStr = line.substring(6);
            if (jsonStr === '[DONE]') continue;
            
            const data = JSON.parse(jsonStr);
            
            // Check for error response first with improved error detection
            if (data.error) {
              const errorMessage = data.error.message || 'Unknown provider error';
              const errorCode = data.error.code || 'unknown';
              console.error('Provider returned error:', data);
              
              // Extract further details from metadata if available
              let errorDetails = 'No additional details';
              let rawProviderError = '';
              
              if (data.error.metadata) {
                errorDetails = JSON.stringify(data.error.metadata);
                
                // For Grok models, extract the raw provider error
                if (data.error.metadata.raw) {
                  try {
                    const rawError = JSON.parse(data.error.metadata.raw);
                    if (rawError.error) {
                      rawProviderError = rawError.error;
                    }
                  } catch (e) {
                    // If we can't parse the raw error, use it as is
                    rawProviderError = data.error.metadata.raw;
                  }
                }
              }
              
              console.error(`OpenRouter error: ${errorMessage} (${errorCode}) - ${errorDetails}`, data);
              
              // Create an error with the provider-specific error message if available
              const errorMsg = rawProviderError 
                ? `Provider error: ${rawProviderError}` 
                : `Provider error: ${errorMessage} (${errorCode})`;
              
              const err = new Error(errorMsg);
              (err as any).originalError = data.error;
              (err as any).statusCode = errorCode;
              (err as any).metadata = data.error.metadata;
              throw err;
            }
            
            // Handle different response formats
            let content = null;
            
            // Standard OpenAI/Claude format
            if (data.choices && data.choices[0]?.delta?.content) {
              content = data.choices[0].delta.content;
            } 
            // Grok models sometimes use this format
            else if (data.choices && data.choices[0]?.message?.content) {
              content = data.choices[0].message.content;
            }
            // Grok models can have a different format with thinking trace
            else if (data.choices && data.choices[0]?.thinking_trace) {
              content = data.choices[0].thinking_trace;
            }
            // Grok delta with message content
            else if (data.choices && data.choices[0]?.delta?.message?.content) {
              content = data.choices[0].delta.message.content;
            }
            // Fallback for any other content format we can find
            else if (data.content) {
              content = data.content;
            }
            
            if (content) {
              callbacks.onChunk(content);
            } else {
              // Suppress debug logs for known non-content messages from Grok models
              // Check if this is a Grok model
              if (model.startsWith('x-ai/grok-')) {
                // Only log if it's not a typical metadata message
                if (!data.id && !data.object) {
                  console.debug('Unhandled SSE format:', data);
                }
              } else {
                console.debug('Unhandled SSE format:', data);
              }
            }
          } catch (e) {
            console.warn('Error parsing SSE chunk:', e);
            // If the chunk contains error data, handle it properly
            if (line.includes('"error"')) {
              try {
                const errorData = JSON.parse(line.substring(6));
                
                if (errorData.error) {
                  const errorMessage = errorData.error.message || 'Unknown provider error';
                  const errorCode = errorData.error.code || 'unknown';
                  
                  // Extract further details from metadata if available
                  let errorDetails = 'No additional details';
                  let rawProviderError = '';
                  
                  if (errorData.error.metadata) {
                    errorDetails = JSON.stringify(errorData.error.metadata);
                    
                    // For Grok models, extract the raw provider error
                    if (errorData.error.metadata.raw) {
                      try {
                        const rawError = JSON.parse(errorData.error.metadata.raw);
                        if (rawError.error) {
                          rawProviderError = rawError.error;
                        }
                      } catch (e) {
                        // If we can't parse the raw error, use it as is
                        rawProviderError = errorData.error.metadata.raw;
                      }
                    }
                  }
                  
                  console.error(`OpenRouter error: ${errorMessage} (${errorCode}) - ${errorDetails}`, errorData);
                  
                  // Create an error with the provider-specific error message if available
                  const errorMsg = rawProviderError 
                    ? `Provider error: ${rawProviderError}` 
                    : `Provider error: ${errorMessage} (${errorCode})`;
                  
                  const err = new Error(errorMsg);
                  (err as any).originalError = errorData.error;
                  (err as any).statusCode = errorCode;
                  (err as any).metadata = errorData.error.metadata;
                  throw err;
                }
              } catch (parseError) {
                console.error('Failed to parse error data:', parseError, 'Original line:', line);
              }
            }
          }
        }
      }
    }
    
    if (callbacks.onComplete) {
      callbacks.onComplete();
    }
    
  } catch (error: unknown) {
    console.error('Error generating completion stream from OpenRouter:', error);
    let llmError: LLMError;
    
    // Special handling for provider errors with improved details
    if (error instanceof Error) {
      // For provider errors 
      if (error.message.includes('Provider')) {
        // Check for common error patterns
        const isQuotaError = error.message.toLowerCase().includes('quota') || 
          error.message.toLowerCase().includes('rate limit') || 
          error.message.includes('429');
        
        const isModelUnavailable = error.message.toLowerCase().includes('unavailable') ||
          error.message.toLowerCase().includes('not available');
          
        const isEmptyMessageError = error.message.toLowerCase().includes('empty message') ||
          error.message.toLowerCase().includes('empty user message');
        
        if (isQuotaError) {
          llmError = {
            type: ErrorType.QUOTA_EXCEEDED,
            message: 'OpenRouter quota or rate limit exceeded. This is common with free models like Grok and Gemini as they have high demand. Please try again later or use a different model.',
            original: error,
            statusCode: 429
          };
        } else if (isModelUnavailable) {
          llmError = {
            type: ErrorType.SERVER_ERROR,
            message: 'The selected model is currently unavailable on OpenRouter. This sometimes happens with experimental models like Grok. Please try a different model.',
            original: error
          };
        } else if (isEmptyMessageError) {
          // Special handling for Grok's empty message errors
          llmError = {
            type: ErrorType.INVALID_REQUEST,
            message: 'Grok models require at least one non-empty user message. Please ensure your message has content.',
            original: error
          };
        } else {
          // Extract the provider-specific error if available
          let userMessage = error.message;
          // If this is the raw error from the provider, clean it up for display
          if ((error as any).metadata && (error as any).metadata.raw) {
            try {
              const rawError = JSON.parse((error as any).metadata.raw);
              if (rawError.error) {
                userMessage = `OpenRouter error: ${rawError.error}`;
              }
            } catch (e) {
              // If parsing fails, use the original error message
            }
          }
          
          llmError = {
            type: ErrorType.INVALID_REQUEST,
            message: userMessage,
            original: error
          };
        }
      } else {
        llmError = parseError(error);
      }
    } else {
      llmError = parseError(error);
    }
    
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

  // Use a powerful model for title generation - prefer OpenAI or Claude
  const titleModel = 'openai/gpt-4.1';
  
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
          model: titleModel,
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