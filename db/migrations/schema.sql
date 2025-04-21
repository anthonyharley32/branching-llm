-- Schema Initialization Script for LearningLLM
-- This script is idempotent and can be run multiple times to reset the database

-- =====================================
-- DESTRUCTIVE ACTIONS - CAUTION
-- =====================================
-- Drop the foreign key constraint first to break the dependency cycle
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS fk_root_message;

-- Drop existing tables if they exist (order matters for foreign key constraints)
DROP TABLE IF EXISTS bugs;
DROP TABLE IF EXISTS conversation_messages;
DROP TABLE IF EXISTS conversation_branches;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS users;

-- Drop existing functions
DROP FUNCTION IF EXISTS trigger_set_updated_at CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;

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

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NEW.created_at, NEW.updated_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::JSONB,
  additional_system_prompt TEXT NULL,
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

-- Bugs
CREATE TABLE IF NOT EXISTS bugs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in-progress', 'fixed', 'verified')),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  related_component TEXT,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  environment JSONB DEFAULT '{}'::JSONB,
  screenshots TEXT[],
  commit_refs TEXT[]
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
CREATE INDEX IF NOT EXISTS idx_bugs_reporter_id ON bugs(reporter_id);
CREATE INDEX IF NOT EXISTS idx_bugs_assignee_id ON bugs(assignee_id);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs(severity);

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

CREATE TRIGGER set_bugs_updated_at
BEFORE UPDATE ON bugs
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Trigger to create users when auth.users are created
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- =====================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bugs ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY users_select_own ON users 
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY users_update_own ON users 
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY users_insert_own ON users 
  FOR INSERT WITH CHECK (auth.uid() = id);

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

-- Bugs policies
CREATE POLICY bugs_select_all ON bugs
  FOR SELECT USING (true);
  
CREATE POLICY bugs_insert_authenticated ON bugs
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR auth.uid() IS NOT NULL);
  
CREATE POLICY bugs_update_all ON bugs
  FOR UPDATE USING (auth.uid() IS NOT NULL);
  
CREATE POLICY bugs_delete_own ON bugs
  FOR DELETE USING (auth.uid() = reporter_id);

-- =====================================
-- STORAGE POLICIES (user-assets bucket)
-- =====================================
-- Policies for the 'user-assets' bucket (ensure this bucket exists and is public)

-- 1. Allow public read access to the 'avatars' folder
DROP POLICY IF EXISTS "Allow public read access to avatars folder" ON storage.objects;
CREATE POLICY "Allow public read access to avatars folder" 
ON storage.objects FOR SELECT
USING ( bucket_id = 'user-assets' AND name LIKE 'avatars/%' );

-- Policy to allow authenticated users to upload their own avatar
-- Extracts the full 36-character UUID from the filename
DROP POLICY IF EXISTS "Allow authenticated users to upload own avatar" ON storage.objects; -- Drop old one first
CREATE POLICY "Allow authenticated users to upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'user-assets' AND
  name LIKE 'avatars/%' AND
  -- Extract the 36-character UUID from the path component after 'avatars/'
  auth.uid() = uuid(substring(split_part(name, '/', 2) from '^(.{36})-'))
);

-- 3. Allow authenticated users to update/delete their own avatar
-- Drop the old combined policy if it exists
DROP POLICY IF EXISTS "Allow authenticated users to update/delete own avatar" ON storage.objects;

-- Create separate policy for UPDATE
DROP POLICY IF EXISTS "Allow authenticated users to update own avatar" ON storage.objects;
CREATE POLICY "Allow authenticated users to update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'user-assets' AND
  name LIKE 'avatars/%' AND
  -- Correctly extract the full 36-character UUID from the filename
  auth.uid() = uuid(substring(split_part(name, '/', 2) from '^(.{36})-'))
);

-- Create separate policy for DELETE
DROP POLICY IF EXISTS "Allow authenticated users to delete own avatar" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'user-assets' AND
  name LIKE 'avatars/%' AND
  -- Correctly extract the full 36-character UUID from the filename
  auth.uid() = uuid(substring(split_part(name, '/', 2) from '^(.{36})-'))
); 