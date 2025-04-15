-- Schema Initialization Script for LearningLLM
-- This script is idempotent and can be run multiple times to reset the database

-- =====================================
-- DESTRUCTIVE ACTIONS - CAUTION
-- =====================================
-- Drop the foreign key constraint first to break the dependency cycle
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS fk_root_message;

-- Drop existing tables if they exist (order matters for foreign key constraints)
DROP TABLE IF EXISTS conversation_messages;
DROP TABLE IF EXISTS conversation_branches;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS users;

-- Drop existing functions
DROP FUNCTION IF EXISTS trigger_set_updated_at;

-- =====================================
-- EXTENSIONS
-- =====================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================
-- FUNCTIONS
-- =====================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- TABLES
-- =====================================

-- Users table (managed by Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  username TEXT UNIQUE,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  root_message_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Conversation Branches
CREATE TABLE IF NOT EXISTS conversation_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  parent_branch_id UUID REFERENCES conversation_branches(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Conversation Messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  branch_id UUID REFERENCES conversation_branches(id) ON DELETE CASCADE,
  parent_message_id UUID REFERENCES conversation_messages(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  selected_text TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  thinking_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- =====================================
-- INDEXES
-- =====================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_branches_conversation_id ON conversation_branches(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_branches_parent_branch_id ON conversation_branches(parent_branch_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_branch_id ON conversation_messages(branch_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_parent_message_id ON conversation_messages(parent_message_id);

-- =====================================
-- TRIGGERS
-- =====================================
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_conversation_branches_updated_at
BEFORE UPDATE ON conversation_branches
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_conversation_messages_updated_at
BEFORE UPDATE ON conversation_messages
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY users_select_own ON users 
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY users_update_own ON users 
  FOR UPDATE USING (auth.uid() = id);

-- User profiles policies
CREATE POLICY profiles_select_own ON user_profiles 
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY profiles_insert_own ON user_profiles 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY profiles_update_own ON user_profiles 
  FOR UPDATE USING (auth.uid() = user_id);
  
CREATE POLICY profiles_delete_own ON user_profiles 
  FOR DELETE USING (auth.uid() = user_id);

-- Conversations policies
CREATE POLICY conversations_select_own ON conversations 
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  
CREATE POLICY conversations_insert_own ON conversations 
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  
CREATE POLICY conversations_update_own ON conversations 
  FOR UPDATE USING (auth.uid() = user_id);
  
CREATE POLICY conversations_delete_own ON conversations 
  FOR DELETE USING (auth.uid() = user_id);

-- Conversation branches policies
CREATE POLICY branches_select_own ON conversation_branches 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_branches.conversation_id 
      AND (conversations.user_id = auth.uid() OR conversations.user_id IS NULL)
    )
  );
  
CREATE POLICY branches_insert_own ON conversation_branches 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_branches.conversation_id 
      AND (conversations.user_id = auth.uid() OR conversations.user_id IS NULL)
    )
  );
  
CREATE POLICY branches_update_own ON conversation_branches 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_branches.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );
  
CREATE POLICY branches_delete_own ON conversation_branches 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_branches.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Conversation messages policies
CREATE POLICY messages_select_own ON conversation_messages 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_messages.conversation_id 
      AND (conversations.user_id = auth.uid() OR conversations.user_id IS NULL)
    )
  );
  
CREATE POLICY messages_insert_own ON conversation_messages 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_messages.conversation_id 
      AND (conversations.user_id = auth.uid() OR conversations.user_id IS NULL)
    )
  );
  
CREATE POLICY messages_update_own ON conversation_messages 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_messages.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );
  
CREATE POLICY messages_delete_own ON conversation_messages 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = conversation_messages.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  ); 