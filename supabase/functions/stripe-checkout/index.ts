import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { 
  stripe, 
  supabase, 
  getOrCreateStripeCustomer, 
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

    const { tierSlug } = await req.json();

    // Get the subscription tier
    const tier = await getSubscriptionTier(tierSlug);
    if (!tier) {
      throw new Error('Invalid subscription tier');
    }

    // For free tier, just update the user subscription
    if (tier.price_cents === 0) {
      const customerId = await getOrCreateStripeCustomer(user.id, user.email!);
      await createOrUpdateUserSubscription(
        user.id,
        tier.id,
        customerId,
        undefined,
        'active'
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Free subscription activated',
          redirect: `${Deno.env.get('FRONTEND_URL')}/`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user.id, user.email!);

    // Create Stripe checkout session with promotional codes enabled
    const sessionData: any = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: tier.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${Deno.env.get('FRONTEND_URL')}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${Deno.env.get('FRONTEND_URL')}/`,
      allow_promotion_codes: true, // Enable discount codes on Stripe checkout page
      metadata: {
        user_id: user.id,
        tier_id: tier.id,
        tier_slug: tierSlug,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          tier_id: tier.id,
          tier_slug: tierSlug,
        },
      },
    };

    const session = await stripe.checkout.sessions.create(sessionData);

    return new Response(
      JSON.stringify({ id: session.id, url: session.url }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
}); 