/**
 * Chat message types
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string | any;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationBranch {
  id: string;
  parentId: string | null;
  messages: Message[];
  selectedText?: string;
}

export interface ChatState {
  conversations: Record<string, Conversation>;
  currentConversationId: string | null;
  loading: boolean;
  error: Error | null;
} 