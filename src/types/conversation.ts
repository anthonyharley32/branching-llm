// src/types/conversation.ts

// Base message structure used for LLM communication and storage
// This might be redundant if types/chat.ts already defines a suitable base Message
// Consider consolidating types if possible
// export interface Message {
//   id: string; 
//   role: 'user' | 'assistant' | 'system';
//   content: string; 
//   timestamp: number; // Unix timestamp (milliseconds) when created - NOTE: Mismatch with types/chat.ts Message
// }

// Import the base Message type if it's the standard
import { Message as BaseMessage } from './chat';

// Represents a node in the conversation tree, linking messages together
export interface MessageNode extends BaseMessage { // Extend the base Message type
  // Optional: thinking content for reasoning models
  thinkingContent?: string;
  parentId: string | null; // ID of the parent message in the branch, null for root
  // Inherited from BaseMessage: createdAt
  // Inherited from BaseMessage: metadata (check ./chat.ts definition)
}

// Represents the entire conversation structure
export interface Conversation {
  id: string; // Unique identifier for the conversation session
  title?: string | null; // Add optional title field
  rootMessageId: string | null; // ID of the very first message (often a system prompt or initial user message)
  messages: Record<string, MessageNode>; // Flat map of all message nodes by their ID
  createdAt: number; // Unix timestamp (milliseconds) when conversation started
  updatedAt?: number; // Optional: Unix timestamp for the last update
  userId?: string; // Optional: Identifier for the user associated with the conversation
  _hasContentChanges?: boolean; // Internal flag to track when conversation content has changed
} 