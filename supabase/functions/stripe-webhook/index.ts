import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { 
  stripe, 
  supabase, 
  createOrUpdateUserSubscription
} from '../_shared/stripe.ts';

// Manual webhook signature verification for Deno compatibility
async function verifyStripeWebhook(payload: string, signature: string, secret: string) {
  const elements = signature.split(',');
  const timestamp = elements.find(el => el.startsWith('t='))?.substring(2);
  const sigs = elements.filter(el => el.startsWith('v1='));
  
  if (!timestamp || sigs.length === 0) {
    throw new Error('Invalid signature format');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(signedPayload);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature_bytes = await crypto.subtle.sign('HMAC', key, data);
  const signature_hex = Array.from(new Uint8Array(signature_bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const isValid = sigs.some(sig => {
    const sigHash = sig.substring(3);
    return signature_hex === sigHash;
  });

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Parse the event JSON
  return JSON.parse(payload);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      throw new Error('No Stripe signature found');
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

    // Verify the webhook signature manually for Deno compatibility
    const event = await verifyStripeWebhook(body, signature, webhookSecret);

    console.log('Stripe webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as any);
        break;
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as any);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as any);
        break;
      
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as any);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as any);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

async function handleCheckoutSessionCompleted(session: any) {
  const userId = session.metadata?.user_id;
  const tierId = session.metadata?.tier_id;

  if (!userId || !tierId) {
    console.error('Missing metadata in checkout session:', session.metadata);
    return;
  }

  // Get subscription details
  let subscription = null;
  if (session.subscription) {
    subscription = await stripe.subscriptions.retrieve(session.subscription);
  }

  // Update user subscription
  await createOrUpdateUserSubscription(
    userId,
    tierId,
    session.customer,
    subscription?.id,
    subscription?.status || 'active',
    subscription ? new Date(subscription.current_period_start * 1000) : new Date(),
    subscription ? new Date(subscription.current_period_end * 1000) : undefined
  );

  console.log(`Subscription created for user ${userId}`);
}

async function handleSubscriptionUpdated(subscription: any) {
  const userId = subscription.metadata?.user_id;
  const tierId = subscription.metadata?.tier_id;

  if (!userId || !tierId) {
    console.error('Missing metadata in subscription:', subscription.metadata);
    return;
  }

  await createOrUpdateUserSubscription(
    userId,
    tierId,
    subscription.customer,
    subscription.id,
    subscription.status,
    new Date(subscription.current_period_start * 1000),
    new Date(subscription.current_period_end * 1000)
  );

  console.log(`Subscription updated for user ${userId}: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: any) {
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    console.error('Missing user_id in subscription metadata:', subscription.metadata);
    return;
  }

  // Update subscription status to canceled
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    console.error('Error updating subscription status:', error);
  }

  console.log(`Subscription deleted for user ${userId}`);
}

async function handlePaymentSucceeded(invoice: any) {
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) {
    return;
  }

  // Update subscription status to active
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    console.error('Error updating subscription after payment success:', error);
  }

  console.log(`Payment succeeded for subscription ${subscriptionId}`);
}

async function handlePaymentFailed(invoice: any) {
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) {
    return;
  }

  // Update subscription status to past_due
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    console.error('Error updating subscription after payment failure:', error);
  }

  console.log(`Payment failed for subscription ${subscriptionId}`);
} 