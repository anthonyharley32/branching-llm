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
  parentId: string | null; // ID of the parent message in the branch, null for root
  // timestamp: number; // Remove if BaseMessage uses createdAt: Date
  // createdAt: Date; // Inherited from BaseMessage
  // Optional: Add childrenIds if needed for easier downward traversal, but can be derived
  // childrenIds?: string[]; 
  // Optional: Metadata specific to the node
  // metadata?: Record<string, any>; 
}

// Represents the entire conversation structure
export interface Conversation {
  id: string; // Unique identifier for the conversation session
  rootMessageId: string | null; // ID of the very first message (often a system prompt or initial user message)
  messages: Record<string, MessageNode>; // Flat map of all message nodes by their ID
  createdAt: number; // Unix timestamp (milliseconds) when conversation started
  updatedAt?: number; // Optional: Unix timestamp for the last update
  userId?: string; // Optional: Identifier for the user associated with the conversation
  // Optional: Other conversation-level metadata
  // title?: string;
} 