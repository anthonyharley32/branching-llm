import { supabase } from '../lib/supabase';
import { 
  SubscriptionTier, 
  UserSubscription, 
  DiscountCode, 
  UsageLimit, 
  StripeCheckoutSession,
  PricingPlan
} from '../types/subscription';

export class PaymentService {
  private static baseUrl = import.meta.env.VITE_API_URL || '/api';

  // Get all active subscription tiers
  static async getSubscriptionTiers(): Promise<SubscriptionTier[]> {
    const { data, error } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('is_active', true)
      .order('price_cents', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch subscription tiers: ${error.message}`);
    }

    return data || [];
  }

  // Get user's current subscription
  static async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select(`
        *,
        tier:subscription_tiers(*)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch user subscription: ${error.message}`);
    }

    return data || null;
  }

  // Check user's daily usage and limits
  static async checkUsageLimit(userId?: string): Promise<UsageLimit> {
    if (!userId) {
      // No login tier - get from subscription tiers
      const { data: tier } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('slug', 'no-login')
        .single();

      if (!tier) {
        throw new Error('No-login tier not found');
      }

      // For no-login, we track usage by IP or session
      // For now, return basic limits
      return {
        canSendMessage: true, // This should be checked against session storage
        dailyLimit: tier.daily_message_limit,
        currentUsage: 0, // This should be tracked in localStorage
        tierName: tier.name,
        tierSlug: tier.slug,
        features: tier.features
      };
    }

    // Get user's subscription and usage
    const [subscription, usage] = await Promise.all([
      this.getUserSubscription(userId),
      this.getDailyUsage(userId)
    ]);

    let tier: SubscriptionTier;
    
    if (subscription?.tier) {
      tier = subscription.tier;
    } else {
      // Default to free tier
      const { data: freeTier } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('slug', 'free')
        .single();
      
      if (!freeTier) {
        throw new Error('Free tier not found');
      }
      tier = freeTier;
    }

    const canSendMessage = tier.daily_message_limit === null || 
                          usage.message_count < tier.daily_message_limit;

    return {
      canSendMessage,
      dailyLimit: tier.daily_message_limit,
      currentUsage: usage.message_count,
      tierName: tier.name,
      tierSlug: tier.slug,
      features: tier.features
    };
  }

  // Get daily usage for a user
  static async getDailyUsage(userId: string) {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('daily_usage')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch daily usage: ${error.message}`);
    }

    return data || { message_count: 0 };
  }

  // Increment usage for a user
  static async incrementUsage(userId?: string): Promise<void> {
    if (!userId) {
      // For no-login users, handle in localStorage
      const today = new Date().toISOString().split('T')[0];
      const key = `daily_usage_${today}`;
      const current = parseInt(localStorage.getItem(key) || '0');
      localStorage.setItem(key, (current + 1).toString());
      return;
    }

    const { error } = await supabase.rpc('increment_daily_usage', {
      user_uuid: userId
    });

    if (error) {
      throw new Error(`Failed to increment usage: ${error.message}`);
    }
  }



  // Create Stripe checkout session
  static async createCheckoutSession(
    tierSlug: string, 
    userId: string
  ): Promise<StripeCheckoutSession> {
    const response = await fetch(`${this.baseUrl}/stripe-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({
        tierSlug,
        userId
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create checkout session: ${error}`);
    }

    return response.json();
  }

  // Create customer portal session
  static async createPortalSession(userId: string): Promise<{ url: string }> {
    const response = await fetch(`${this.baseUrl}/stripe-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create portal session: ${error}`);
    }

    return response.json();
  }

  // Get pricing plans without discounts (discounts now handled by Stripe)
  static async getPricingPlans(): Promise<PricingPlan[]> {
    const tiers = await this.getSubscriptionTiers();

    return tiers.map((tier: SubscriptionTier) => {
      const price = tier.price_cents / 100;
      const plan: PricingPlan = {
        tier,
        price,
        popular: tier.slug === 'pro' // Mark Pro as popular
      };

      return plan;
    });
  }

  // Cancel subscription at period end
  static async cancelSubscription(userId: string): Promise<{ message: string; accessUntil: Date }> {
    const response = await fetch(`${this.baseUrl}/stripe-subscription-change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({
        action: 'cancel',
        userId,
        cancelImmediately: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to cancel subscription: ${error}`);
    }

    return response.json();
  }

  // Cancel subscription immediately with refund
  static async cancelSubscriptionImmediately(userId: string): Promise<{ message: string; accessUntil: Date }> {
    const response = await fetch(`${this.baseUrl}/stripe-subscription-change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({
        action: 'cancel',
        userId,
        cancelImmediately: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to cancel subscription immediately: ${error}`);
    }

    return response.json();
  }

  // Change subscription plan with proration
  static async changeSubscriptionPlan(userId: string, newTierSlug: string, isUpgrade: boolean): Promise<{ message: string; subscription: any }> {
    const response = await fetch(`${this.baseUrl}/stripe-subscription-change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({
        action: isUpgrade ? 'upgrade' : 'downgrade',
        newTierSlug,
        userId
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to change subscription: ${error}`);
    }

    return response.json();
  }

  // Legacy method - redirect to customer portal for general management
  static async openCustomerPortal(userId: string): Promise<void> {
    const { url } = await this.createPortalSession(userId);
    window.location.href = url;
  }
} 