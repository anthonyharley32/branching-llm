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

// Generate a chat completion from OpenAI
export async function generateCompletion(
  messages: Message[]
): Promise<Message> {
  try {
    // Ensure we have an API key
    if (!config.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    
    // Get or initialize client
    const client = getClient();
    
    // Convert messages to OpenAI format
    const openaiMessages = convertToOpenAIMessages(messages);
    
    // Make the API call
    const response = await client.chat.completions.create({
      model: config.model,
      messages: openaiMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
    });
    
    // Extract the assistant's response
    const assistantMessage = response.choices[0]?.message;
    
    if (!assistantMessage || !assistantMessage.content) {
      throw new Error('No response content received from OpenAI');
    }
    
    // Return the response in our app's format
    return {
      id: `openai-${Date.now()}`,
      role: 'assistant',
      content: assistantMessage.content,
      createdAt: new Date(),
    };
  } catch (error: unknown) {
    console.error('Error generating completion from OpenAI:', error);
    
    // Handle and categorize errors
    const llmError = parseError(error);
    throw llmError;
  }
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