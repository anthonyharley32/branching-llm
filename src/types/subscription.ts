export interface SubscriptionTier {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  stripe_price_id: string | null;
  daily_message_limit: number | null;
  features: {
    storage: boolean;
    models: string[];
    features: string[];
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  tier_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  discount_percent: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  tier?: SubscriptionTier;
}

export interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountCodeUsage {
  id: string;
  discount_code_id: string;
  user_id: string;
  subscription_id: string;
  used_at: string;
  discount_code?: DiscountCode;
}

export interface DailyUsage {
  id: string;
  user_id: string | null;
  date: string;
  message_count: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface UsageLimit {
  canSendMessage: boolean;
  dailyLimit: number | null;
  currentUsage: number;
  tierName: string;
  tierSlug: string;
  features: SubscriptionTier['features'];
}

export interface StripeCheckoutSession {
  id?: string;
  url?: string;
  success?: boolean;
  message?: string;
  redirect?: string;
}

export interface PricingPlan {
  tier: SubscriptionTier;
  price: number;
  originalPrice?: number;
  discount?: DiscountCode;
  popular?: boolean;
} 