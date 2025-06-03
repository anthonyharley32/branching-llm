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

-- Function to get user's current subscription tier
CREATE OR REPLACE FUNCTION get_user_subscription_tier(user_uuid UUID)
RETURNS TABLE (
  tier_name TEXT,
  tier_slug TEXT,
  daily_message_limit INTEGER,
  features JSONB,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    st.name,
    st.slug,
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
      st.daily_message_limit,
      st.features,
      'none'::TEXT as status
    FROM subscription_tiers st
    WHERE st.slug = 'free'
    LIMIT 1;
  END IF;
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
  price_cents INTEGER NOT NULL DEFAULT 0,
  stripe_price_id TEXT,
  daily_message_limit INTEGER,
  features JSONB DEFAULT '{}'::JSONB,
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

-- Discount Codes
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_percent INTEGER NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Discount Code Usage
CREATE TABLE IF NOT EXISTS discount_code_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discount_code_id UUID REFERENCES discount_codes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE CASCADE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(discount_code_id, user_id)
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
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_is_active ON subscription_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier_id ON user_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_is_active ON discount_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_discount_codes_expires_at ON discount_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_discount_code_usage_discount_code_id ON discount_code_usage(discount_code_id);
CREATE INDEX IF NOT EXISTS idx_discount_code_usage_user_id ON discount_code_usage(user_id);
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

CREATE TRIGGER set_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_discount_codes_updated_at
BEFORE UPDATE ON discount_codes
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
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_code_usage ENABLE ROW LEVEL SECURITY;
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

-- User subscriptions policies
CREATE POLICY user_subscriptions_select_own ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY user_subscriptions_insert_own ON user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY user_subscriptions_update_own ON user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Discount codes policies (publicly readable for validation)
CREATE POLICY discount_codes_select_active ON discount_codes
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Discount code usage policies
CREATE POLICY discount_code_usage_select_own ON discount_code_usage
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY discount_code_usage_insert_own ON discount_code_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

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

-- Insert default subscription tiers
INSERT INTO subscription_tiers (name, slug, description, price_cents, stripe_price_id, daily_message_limit, features) VALUES
  ('No Login', 'no-login', 'Limited access without account registration', 0, NULL, 5, '{"storage": false, "models": ["default"], "features": ["basic_chat"]}'),
  ('Free', 'free', 'Free tier with message storage and history', 0, NULL, 20, '{"storage": true, "models": ["default"], "features": ["basic_chat", "conversation_history", "message_storage"]}'),
  ('Pro', 'pro', 'Pro tier with model selection and unlimited messages', 1500, 'price_1RFNLuLF1NTZsL3ciJANzk9f', NULL, '{"storage": true, "models": ["claude", "gpt-4.1", "grok", "gemini"], "features": ["basic_chat", "conversation_history", "message_storage", "model_selection", "unlimited_messages"]}'),
  ('Unlimited', 'unlimited', 'Unlimited tier with reasoning models', 3000, 'price_1RFNPALF1NTZsL3cJCAy0Fo6', NULL, '{"storage": true, "models": ["claude", "gpt-4.1", "grok", "gemini", "claude-reasoning", "gpt-4o-reasoning"], "features": ["basic_chat", "conversation_history", "message_storage", "model_selection", "unlimited_messages", "reasoning_models"]}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  stripe_price_id = EXCLUDED.stripe_price_id,
  daily_message_limit = EXCLUDED.daily_message_limit,
  features = EXCLUDED.features,
  updated_at = NOW();

-- Insert some sample discount codes for beta testing
INSERT INTO discount_codes (code, description, discount_percent, max_uses, is_active) VALUES
  ('BETA50', 'Beta tester 50% discount', 50, 100, true),
  ('FRIENDS20', 'Friends and family 20% discount', 20, 50, true),
  ('LAUNCH30', 'Launch week 30% discount', 30, 200, true)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  discount_percent = EXCLUDED.discount_percent,
  max_uses = EXCLUDED.max_uses,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();