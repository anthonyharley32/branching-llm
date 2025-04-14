/**
 * LLM Service - Main Interface
 */

import { Message } from '../../types/chat';
import { generateCompletion, initializeClient, ErrorType, LLMError } from './openai';

// Export the main function
export {
  generateCompletion,
  initializeClient
};

// Export the types
export type { LLMError };
export { ErrorType }; 