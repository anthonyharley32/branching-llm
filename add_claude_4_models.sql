-- Quick SQL Script to Add Claude 4 Models to Existing Schema
-- Run this script to add the new Claude 4 models to your existing database

-- Add Claude Sonnet 4 (Pro tier)
INSERT INTO models (name, company, api_model_id, minimum_tier_id, is_reasoning, description) 
SELECT 
  'Claude Sonnet 4', 
  'anthropic', 
  'anthropic/claude-sonnet-4', 
  st.id, 
  false, 
  'Anthropic''s latest high-performance model with state-of-the-art coding capabilities (72.7% on SWE-bench). Balances performance and efficiency for everyday development tasks.'
FROM subscription_tiers st 
WHERE st.slug = 'pro'
ON CONFLICT (api_model_id) DO UPDATE SET
  name = EXCLUDED.name,
  company = EXCLUDED.company,
  minimum_tier_id = EXCLUDED.minimum_tier_id,
  is_reasoning = EXCLUDED.is_reasoning,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Add Claude Opus 4 (Unlimited tier)
INSERT INTO models (name, company, api_model_id, minimum_tier_id, is_reasoning, description) 
SELECT 
  'Claude Opus 4', 
  'anthropic', 
  'anthropic/claude-opus-4', 
  st.id, 
  false, 
  'The world''s best coding model with sustained performance on complex, long-running tasks. Excels at agent workflows and complex problem-solving with extended context handling.'
FROM subscription_tiers st 
WHERE st.slug = 'unlimited'
ON CONFLICT (api_model_id) DO UPDATE SET
  name = EXCLUDED.name,
  company = EXCLUDED.company,
  minimum_tier_id = EXCLUDED.minimum_tier_id,
  is_reasoning = EXCLUDED.is_reasoning,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Verify the new models were added
SELECT 
  m.name,
  m.company,
  m.api_model_id,
  st.slug as tier,
  m.is_reasoning,
  m.description
FROM models m
JOIN subscription_tiers st ON m.minimum_tier_id = st.id
WHERE m.company = 'anthropic' AND m.name LIKE '%Claude%4%'
ORDER BY st.tier_level, m.is_reasoning, m.name; 