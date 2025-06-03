import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { 
  stripe, 
  supabase, 
  getSubscriptionTier,
  createOrUpdateUserSubscription
} from '../_shared/stripe.ts';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid token');
    }

    const { action, newTierSlug, cancelImmediately } = await req.json();

    // Get user's current subscription
    const { data: currentSubscription } = await supabase
      .from('user_subscriptions')
      .select('*, tier:subscription_tiers(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!currentSubscription?.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    let result;

    switch (action) {
      case 'upgrade':
        result = await handleUpgrade(currentSubscription, newTierSlug, user.id);
        break;
      case 'downgrade':
        result = await handleDowngrade(currentSubscription, newTierSlug, user.id);
        break;
      case 'cancel':
        result = await handleCancellation(currentSubscription, user.id, cancelImmediately);
        break;
      default:
        throw new Error('Invalid action');
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Subscription change error:', error);
    
    // Determine if this is a client error (4xx) or server error (5xx)
    const { statusCode, errorMessage } = categorizeError(error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      }
    );
  }
});

function categorizeError(error: any): { statusCode: number; errorMessage: string } {
  const errorMessage = error.message || 'An unexpected error occurred';
  
  // Client errors (400-499) - Issues with the request or user input
  const clientErrorPatterns = [
    'No authorization header',
    'Invalid token',
    'Invalid action',
    'Invalid subscription tier',
    'No active subscription found',
    'Missing required field',
    'Invalid request body',
    'Authentication failed',
    'Unauthorized',
    'Bad request',
    'Not found'
  ];
  
  // Check if it's a client error based on message content
  const isClientError = clientErrorPatterns.some(pattern => 
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  );
  
  if (isClientError) {
    return { statusCode: 400, errorMessage };
  }
  
  // Check for specific Stripe errors
  if (error.type && error.type.startsWith('Stripe')) {
    // Stripe API errors are typically server/upstream issues
    return { statusCode: 502, errorMessage: 'Payment service temporarily unavailable' };
  }
  
  // Check for database errors (Supabase errors)
  if (error.code || (error.message && error.message.includes('supabase'))) {
    return { statusCode: 503, errorMessage: 'Database service temporarily unavailable' };
  }
  
  // Check for network/timeout errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || 
      errorMessage.includes('timeout') || errorMessage.includes('network')) {
    return { statusCode: 503, errorMessage: 'Service temporarily unavailable' };
  }
  
  // Default to server error for any unhandled cases
  return { statusCode: 500, errorMessage: 'Internal server error' };
}

async function handleUpgrade(currentSubscription: any, newTierSlug: string, userId: string) {
  // Get the new tier
  const newTier = await getSubscriptionTier(newTierSlug);
  if (!newTier) {
    throw new Error('Invalid subscription tier');
  }

  const subscription = await stripe.subscriptions.retrieve(currentSubscription.stripe_subscription_id);
  
  // Update the subscription with proration
  const updatedSubscription = await stripe.subscriptions.update(
    currentSubscription.stripe_subscription_id,
    {
      items: [{
        id: subscription.items.data[0].id,
        price: newTier.stripe_price_id,
      }],
      proration_behavior: 'create_prorations', // This creates a proration invoice
      metadata: {
        user_id: userId,
        tier_id: newTier.id,
        tier_slug: newTier.slug,
        change_type: 'upgrade'
      }
    }
  );

  // Update our database
  await createOrUpdateUserSubscription(
    userId,
    newTier.id,
    currentSubscription.stripe_customer_id,
    updatedSubscription.id,
    updatedSubscription.status,
    new Date(updatedSubscription.current_period_start * 1000),
    new Date(updatedSubscription.current_period_end * 1000)
  );

  return {
    success: true,
    message: `Upgraded to ${newTier.name}. You've been charged the prorated difference.`,
    subscription: updatedSubscription
  };
}

async function handleDowngrade(currentSubscription: any, newTierSlug: string, userId: string) {
  // Get the new tier
  const newTier = await getSubscriptionTier(newTierSlug);
  if (!newTier) {
    throw new Error('Invalid subscription tier');
  }

  // For downgrades, we schedule the change for the end of the billing period
  // This prevents immediate charges and maintains access
  const subscription = await stripe.subscriptions.retrieve(currentSubscription.stripe_subscription_id);
  
  const updatedSubscription = await stripe.subscriptions.update(
    currentSubscription.stripe_subscription_id,
    {
      items: [{
        id: subscription.items.data[0].id,
        price: newTier.stripe_price_id,
      }],
      proration_behavior: 'none', // No proration for downgrades
      billing_cycle_anchor: 'unchanged', // Keep current billing cycle
      metadata: {
        user_id: userId,
        tier_id: newTier.id,
        tier_slug: newTier.slug,
        change_type: 'downgrade'
      }
    }
  );

  // Note: We don't update the database tier until the billing cycle changes
  // The webhook will handle this when the period renews

  return {
    success: true,
    message: `Downgrade to ${newTier.name} scheduled. Changes will take effect at the end of your billing period.`,
    subscription: updatedSubscription
  };
}

async function handleCancellation(currentSubscription: any, userId: string, cancelImmediately?: boolean) {
  const subscription = await stripe.subscriptions.retrieve(currentSubscription.stripe_subscription_id);
  
  if (cancelImmediately) {
    // Immediate cancellation with refund
    const canceledSubscription = await stripe.subscriptions.cancel(
      currentSubscription.stripe_subscription_id,
      {
        prorate: true, // This will issue a refund for the unused portion
      }
    );

    // Update our database
    await supabase
      .from('user_subscriptions')
      .update({
        status: 'canceled',
        cancel_at_period_end: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    return {
      success: true,
      message: 'Subscription canceled immediately. A prorated refund has been issued for the unused portion.',
      subscription: canceledSubscription,
      access_until: new Date() // Immediate loss of access
    };
  } else {
    // Cancel at period end (most common approach)
    const canceledSubscription = await stripe.subscriptions.update(
      currentSubscription.stripe_subscription_id,
      {
        cancel_at_period_end: true,
        metadata: {
          ...subscription.metadata,
          change_type: 'cancel_at_period_end'
        }
      }
    );

    // Update our database to reflect the cancellation
    await supabase
      .from('user_subscriptions')
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    return {
      success: true,
      message: 'Subscription canceled. You will retain access until the end of your billing period.',
      subscription: canceledSubscription,
      access_until: new Date(canceledSubscription.current_period_end * 1000)
    };
  }
} 