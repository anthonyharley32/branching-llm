-- Schema Initialization Script for LearningLLM
-- This script is idempotent and can be run multiple times to reset the database

-- =====================================
-- DESTRUCTIVE ACTIONS - CAUTION
-- =====================================
-- Drop the foreign key constraint first to break the dependency cycle
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS fk_root_message;

-- Drop existing tables if they exist (order matters for foreign key constraints)
DROP TABLE IF EXISTS daily_usage;
DROP TABLE IF EXISTS discount_code_usage;
DROP TABLE IF EXISTS discount_codes;
DROP TABLE IF EXISTS user_subscriptions;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS subscription_tiers;
DROP TABLE IF EXISTS bugs;
DROP TABLE IF EXISTS conversation_messages;
DROP TABLE IF EXISTS conversation_branches;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS users;

-- Drop existing functions
DROP FUNCTION IF EXISTS trigger_set_updated_at CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP FUNCTION IF EXISTS get_user_subscription_tier CASCADE;
DROP FUNCTION IF EXISTS check_daily_usage_limit CASCADE;
DROP FUNCTION IF EXISTS increment_daily_usage CASCADE;

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
DECLARE
  free_tier_id UUID;
BEGIN
  -- Insert into public.users table
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NEW.created_at, NEW.updated_at);
  
  -- Create a user profile with default values
  INSERT INTO public.user_profiles (user_id, avatar_url, preferences, additional_system_prompt, created_at, updated_at)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'), -- Get avatar from OAuth providers
    '{}'::JSONB, 
    '', 
    NEW.created_at, 
    NEW.updated_at
  );
  
  -- Get the free tier ID
  SELECT id INTO free_tier_id 
  FROM public.subscription_tiers 
  WHERE slug = 'free' AND is_active = true 
  LIMIT 1;
  
  -- Create a free tier subscription for the new user
  IF free_tier_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, tier_id, status, created_at, updated_at)
    VALUES (NEW.id, free_tier_id, 'active', NEW.created_at, NEW.updated_at);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's current subscription tier with available models
CREATE OR REPLACE FUNCTION get_user_subscription_tier(user_uuid UUID)
RETURNS TABLE (
  tier_name TEXT,
  tier_slug TEXT,
  tier_level INTEGER,
  daily_message_limit INTEGER,
  features JSONB,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    st.name,
    st.slug,
    st.tier_level,
    st.daily_message_limit,
    st.features,
    COALESCE(us.status, 'none') as status
  FROM users u
  LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'active'
  LEFT JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE u.id = user_uuid;
  
  -- If no subscription found, return free tier
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      st.name,
      st.slug,
      st.tier_level,
      st.daily_message_limit,
      st.features,
      'none'::TEXT as status
    FROM subscription_tiers st
    WHERE st.slug = 'free'
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available models for a user
CREATE OR REPLACE FUNCTION get_user_available_models(user_uuid UUID)
RETURNS TABLE (
  model_id UUID,
  model_name TEXT,
  company TEXT,
  api_model_id TEXT,
  is_reasoning BOOLEAN,
  description TEXT
) AS $$
DECLARE
  user_tier_level INTEGER;
BEGIN
  -- Get user's tier level
  SELECT COALESCE(st.tier_level, 0) INTO user_tier_level
  FROM users u
  LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'active'
  LEFT JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE u.id = user_uuid;
  
  -- If no tier found, default to free tier level (0)
  IF user_tier_level IS NULL THEN
    user_tier_level := 0;
  END IF;
  
  -- Return models available for this tier level
  RETURN QUERY
  SELECT 
    m.id,
    m.name,
    m.company,
    m.api_model_id,
    m.is_reasoning,
    m.description
  FROM models m
  JOIN subscription_tiers st ON m.minimum_tier_id = st.id
  WHERE st.tier_level <= user_tier_level 
    AND m.is_active = true
  ORDER BY m.company, m.is_reasoning, m.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and update daily usage
CREATE OR REPLACE FUNCTION check_daily_usage_limit(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  daily_limit INTEGER;
  user_tier RECORD;
BEGIN
  -- Get user's current tier and daily limit
  SELECT * INTO user_tier FROM get_user_subscription_tier(user_uuid) LIMIT 1;
  
  -- If unlimited messages (NULL limit), allow
  IF user_tier.daily_message_limit IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Get current usage for today
  SELECT COALESCE(message_count, 0) INTO current_usage
  FROM daily_usage
  WHERE user_id = user_uuid AND date = CURRENT_DATE;
  
  -- Check if under limit
  RETURN current_usage < user_tier.daily_message_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment daily usage
CREATE OR REPLACE FUNCTION increment_daily_usage(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_usage (user_id, date, message_count)
  VALUES (user_uuid, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET 
    message_count = daily_usage.message_count + 1,
    updated_at = NOW();
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

-- Subscription Tiers
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  tier_level INTEGER NOT NULL UNIQUE, -- 0=no-login, 1=free, 2=pro, 3=unlimited
  price_cents INTEGER NOT NULL DEFAULT 0,
  stripe_price_id TEXT,
  daily_message_limit INTEGER,
  features JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Models table - centralized model management
CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company TEXT NOT NULL, -- openai, anthropic, google, xai, meta, etc.
  api_model_id TEXT NOT NULL UNIQUE, -- actual API identifier like "openai/gpt-4.1"
  minimum_tier_id UUID REFERENCES subscription_tiers(id) ON DELETE RESTRICT NOT NULL,
  is_reasoning BOOLEAN DEFAULT false,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- User Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  tier_id UUID REFERENCES subscription_tiers(id) ON DELETE RESTRICT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid')),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  discount_percent INTEGER DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Daily Usage Tracking
CREATE TABLE IF NOT EXISTS daily_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, date)
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
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_slug ON subscription_tiers(slug);
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_tier_level ON subscription_tiers(tier_level);
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_is_active ON subscription_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_models_company ON models(company);
CREATE INDEX IF NOT EXISTS idx_models_api_model_id ON models(api_model_id);
CREATE INDEX IF NOT EXISTS idx_models_minimum_tier_id ON models(minimum_tier_id);
CREATE INDEX IF NOT EXISTS idx_models_is_active ON models(is_active);
CREATE INDEX IF NOT EXISTS idx_models_is_reasoning ON models(is_reasoning);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier_id ON user_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_id ON daily_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);
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

CREATE TRIGGER set_subscription_tiers_updated_at
BEFORE UPDATE ON subscription_tiers
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_models_updated_at
BEFORE UPDATE ON models
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_daily_usage_updated_at
BEFORE UPDATE ON daily_usage
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
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
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

-- Subscription tiers policies (publicly readable)
CREATE POLICY subscription_tiers_select_all ON subscription_tiers
  FOR SELECT USING (is_active = true);

-- Models policies (publicly readable for active models)
CREATE POLICY models_select_active ON models
  FOR SELECT USING (is_active = true);

-- User subscriptions policies
CREATE POLICY user_subscriptions_select_own ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY user_subscriptions_insert_own ON user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY user_subscriptions_update_own ON user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Daily usage policies
CREATE POLICY daily_usage_select_own ON daily_usage
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  
CREATE POLICY daily_usage_insert_own ON daily_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  
CREATE POLICY daily_usage_update_own ON daily_usage
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

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

-- =====================================
-- SEED DATA
-- =====================================

-- Insert subscription tiers with tier levels
INSERT INTO subscription_tiers (name, slug, description, tier_level, price_cents, stripe_price_id, daily_message_limit, features) VALUES
  ('No Login', 'no-login', 'Limited access without account registration', 0, 0, NULL, 5, '{"storage": false, "features": ["basic_chat"]}'),
  ('Free', 'free', 'Free tier with message storage and history', 1, 0, NULL, 20, '{"storage": true, "features": ["basic_chat", "conversation_history", "message_storage"]}'),
  ('Pro', 'pro', 'Pro tier with model selection and unlimited messages', 2, 1500, 'price_1RVzNPLF1NTZsL3ck4RQuAlO', NULL, '{"storage": true, "features": ["basic_chat", "conversation_history", "message_storage", "model_selection", "unlimited_messages"]}'),
  ('Unlimited', 'unlimited', 'Unlimited tier with reasoning models', 3, 3000, 'price_1RVzNfLF1NTZsL3cGHQNq1IA', NULL, '{"storage": true, "features": ["basic_chat", "conversation_history", "message_storage", "model_selection", "unlimited_messages", "reasoning_models"]}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tier_level = EXCLUDED.tier_level,
  price_cents = EXCLUDED.price_cents,
  stripe_price_id = EXCLUDED.stripe_price_id,
  daily_message_limit = EXCLUDED.daily_message_limit,
  features = EXCLUDED.features,
  updated_at = NOW();

-- Insert models with proper tier associations
-- Get tier IDs for reference
WITH tier_ids AS (
  SELECT 
    (SELECT id FROM subscription_tiers WHERE slug = 'no-login') as no_login_id,
    (SELECT id FROM subscription_tiers WHERE slug = 'free') as free_id,
    (SELECT id FROM subscription_tiers WHERE slug = 'pro') as pro_id,
    (SELECT id FROM subscription_tiers WHERE slug = 'unlimited') as unlimited_id
)
INSERT INTO models (name, company, api_model_id, minimum_tier_id, is_reasoning, description) 
SELECT * FROM (
  VALUES
    -- Free tier models
    ('GPT-4.1', 'openai', 'openai/gpt-4.1', (SELECT free_id FROM tier_ids), false, 'OpenAI''s most capable model for complex tasks requiring deep understanding.'),
    
    -- Pro tier models (non-reasoning)
    ('Claude 3.7 Sonnet', 'anthropic', 'anthropic/claude-3.7-sonnet', (SELECT pro_id FROM tier_ids), false, 'Anthropic''s balanced model with strong instruction following capabilities.'),
    ('Claude Sonnet 4', 'anthropic', 'anthropic/claude-sonnet-4', (SELECT pro_id FROM tier_ids), false, 'Anthropic''s latest high-performance model with state-of-the-art coding capabilities (72.7% on SWE-bench). Balances performance and efficiency for everyday development tasks.'),
    ('Grok 3 Beta', 'xai', 'x-ai/grok-3-beta', (SELECT pro_id FROM tier_ids), false, 'Full-sized model with wide knowledge. Shows its thinking process in responses.'),
    ('Gemini 2.5 Flash Preview', 'google', 'google/gemini-2.5-flash-preview', (SELECT pro_id FROM tier_ids), false, 'Google''s fastest Gemini model for responsive applications.'),
    
    -- Unlimited tier models (reasoning and premium)
    ('Claude Opus 4', 'anthropic', 'anthropic/claude-opus-4', (SELECT unlimited_id FROM tier_ids), false, 'The world''s best coding model with sustained performance on complex, long-running tasks. Excels at agent workflows and complex problem-solving with extended context handling.'),
    ('Claude 3.7 Sonnet Thinking', 'anthropic', 'anthropic/claude-3.7-sonnet:thinking', (SELECT unlimited_id FROM tier_ids), true, 'Claude 3.7 Sonnet with step-by-step reasoning visible in the response. Optimized for complex thought processes.'),
    ('o4 Mini High', 'openai', 'openai/o4-mini-high', (SELECT unlimited_id FROM tier_ids), true, 'Smaller, faster version of GPT-4.1 optimized for responsive interactions and efficient reasoning.'),
    ('Grok 3 Mini Beta', 'xai', 'x-ai/grok-3-mini-beta', (SELECT unlimited_id FROM tier_ids), true, 'A lightweight, thinking model ideal for reasoning-heavy tasks that need less domain knowledge. Excels at math and solving puzzles.'),
    ('Gemini 2.5 Pro Preview', 'google', 'google/gemini-2.5-pro-preview-03-25', (SELECT unlimited_id FROM tier_ids), true, 'Google''s most capable Gemini model for complex reasoning tasks.')
) AS v(name, company, api_model_id, minimum_tier_id, is_reasoning, description)
ON CONFLICT (api_model_id) DO UPDATE SET
  name = EXCLUDED.name,
  company = EXCLUDED.company,
  minimum_tier_id = EXCLUDED.minimum_tier_id,
  is_reasoning = EXCLUDED.is_reasoning,
  description = EXCLUDED.description,
  updated_at = NOW();