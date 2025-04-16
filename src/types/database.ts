/**
 * TypeScript type definitions for database models
 */

export type User = {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type UserProfile = {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  root_message_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationBranch = {
  id: string;
  conversation_id: string;
  parent_branch_id: string | null;
  name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRole = 'user' | 'assistant' | 'system';

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  branch_id: string | null;
  parent_message_id: string | null;
  role: MessageRole;
  content: string;
  selected_text: string | null;
  metadata: Record<string, any>;
  thinking_content: string | null;
  created_at: string;
  updated_at: string;
};

export type Bug = {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'new' | 'in-progress' | 'fixed' | 'verified';
  reporter_id: string | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  related_component: string | null;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  environment: Record<string, any>;
  screenshots: string[] | null;
  commit_refs: string[] | null;
};

// Define types for table names to use with the database helper functions
export type Tables = {
  users: User;
  user_profiles: UserProfile;
  conversations: Conversation;
  conversation_branches: ConversationBranch;
  conversation_messages: ConversationMessage;
  bugs: Bug;
};

export type TableName = keyof Tables; 