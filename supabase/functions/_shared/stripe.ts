import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export { stripe, supabase };

export interface SubscriptionTier {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  stripe_price_id: string | null;
  daily_message_limit: number | null;
  features: Record<string, any>;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  tier_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  discount_percent: number;
  metadata: Record<string, any>;
}

export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  // Check if customer already exists in our database
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (subscription?.stripe_customer_id) {
    return subscription.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: {
      supabase_user_id: userId,
    },
  });

  return customer.id;
}

export async function getSubscriptionTier(slug: string): Promise<SubscriptionTier | null> {
  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching subscription tier:', error);
    return null;
  }

  return data;
}

export async function createOrUpdateUserSubscription(
  userId: string,
  tierId: string,
  stripeCustomerId: string,
  stripeSubscriptionId?: string,
  status = 'active',
  periodStart?: Date,
  periodEnd?: Date
): Promise<void> {
  const subscriptionData = {
    user_id: userId,
    tier_id: tierId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    status,
    current_period_start: periodStart?.toISOString(),
    current_period_end: periodEnd?.toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('user_subscriptions')
    .upsert(subscriptionData, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Error updating user subscription:', error);
    throw error;
  }
}

 