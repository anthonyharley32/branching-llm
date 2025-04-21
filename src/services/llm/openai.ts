/**
 * OpenAI API Integration
 */

import OpenAI from 'openai';
import { config } from './config';
import { Message } from '../../types/chat';

// Error types
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

// OpenAI client instance
let openaiClient: OpenAI | null = null;

// Initialize OpenAI client
export function initializeClient(): OpenAI {
  if (!config.apiKey) {
    throw new Error('OpenAI API key is required but not provided');
  }
  
  openaiClient = new OpenAI({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true, // For client-side usage only
  });
  
  return openaiClient;
}

// Get initialized client or create one
export function getClient(): OpenAI {
  if (!openaiClient) {
    return initializeClient();
  }
  return openaiClient;
}

// Convert our message format to OpenAI format
function convertToOpenAIMessages(messages: Message[]): any[] {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

// Generate a non-streaming completion from OpenAI
export async function generateCompletion(messages: Message[]): Promise<string> {
  try {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    
    const client = getClient();
    
    const systemMessage = { role: 'system' as const, content: config.systemPrompt };
    const openaiMessages = [systemMessage, ...convertToOpenAIMessages(messages)];
    
    // Make the API call without streaming
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: openaiMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
    });
    
    return completion.choices[0].message.content || '';
    
  } catch (error: unknown) {
    console.error('Error generating completion from OpenAI:', error);
    const llmError = parseError(error);
    throw llmError;
  }
}

// Interface for streaming callbacks
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: LLMError) => void;
}

// Generate a chat completion from OpenAI, streaming the response
export async function generateCompletionStream(
  messages: Message[],
  callbacks: StreamCallbacks
): Promise<void> { // Returns void as results are handled via callbacks
  try {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    
    const client = getClient();
    
    const systemMessage = { role: 'system' as const, content: config.systemPrompt };
    const openaiMessages = [systemMessage, ...convertToOpenAIMessages(messages)];
    
    // Make the API call with stream enabled
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: openaiMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true, // Enable streaming
    });
    
    // Process the stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        callbacks.onChunk(content);
      }
    }
    
    // Signal completion
    if (callbacks.onComplete) {
      callbacks.onComplete();
    }

  } catch (error: unknown) {
    console.error('Error generating completion stream from OpenAI:', error);
    const llmError = parseError(error);
    // Signal error
    if (callbacks.onError) {
      callbacks.onError(llmError);
    } else {
      // If no error handler, re-throw as a fallback
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
  const client = getClient();
  const maxTitleLength = 30; // Maximum allowed title length
  
  const systemPrompt = `Summarize the following user message into a concise conversation title, maximum ${maxTitleLength} characters. Be brief and capture the main topic. Title:`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4-turbo", // Explicitly use gpt-4-turbo for titles
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.5, // Lower temperature for more deterministic titles
        max_tokens: 15, // Keep response short
        n: 1, // Generate only one title candidate
        stream: false // We need the full response
      });

      const generatedTitle = completion.choices[0]?.message?.content?.trim();

      if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= maxTitleLength) {
        // Remove potential quotes if the model adds them
        return generatedTitle.replace(/^["']|["']$/g, ''); 
      } else {
        console.warn(`Title generation attempt ${attempt}: Title too long or empty ('${generatedTitle}'). Retrying...`);
      }
    } catch (error: unknown) {
      console.error(`Error generating title on attempt ${attempt}:`, error);
      const llmError = parseError(error);
      // Don't retry on specific errors like auth/quota
      if (llmError.type === ErrorType.AUTHENTICATION || llmError.type === ErrorType.QUOTA_EXCEEDED) {
        console.error(`Unrecoverable error encountered (${llmError.type}), stopping title generation.`);
        break; 
      }
      // For other errors, log and continue retrying
    }
  }

  console.warn(`Failed to generate a valid title after ${maxRetries} attempts.`);
  return defaultTitle; // Return default title if all attempts fail
}

// Parse and categorize OpenAI errors
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
  
  // If it's an OpenAI API error
  if ('status' in error && typeof (error as any).status === 'number') {
    const status = (error as any).status;
    const message = error.message;
    
    // Categorize based on status code
    if (status === 401) {
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
          message: 'OpenAI API quota exceeded. Please check your billing information.',
          statusCode: status,
          original: error,
        };
      } else {
        return {
          type: ErrorType.RATE_LIMIT,
          message: 'OpenAI API rate limit exceeded. Please try again later.',
          statusCode: status,
          original: error,
        };
      }
    } else if (status >= 400 && status < 500) {
      return {
        type: ErrorType.INVALID_REQUEST,
        message: `Invalid request to OpenAI API: ${message}`,
        statusCode: status,
        original: error,
      };
    } else if (status >= 500) {
      return {
        type: ErrorType.SERVER_ERROR,
        message: 'OpenAI API server error. Please try again later.',
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