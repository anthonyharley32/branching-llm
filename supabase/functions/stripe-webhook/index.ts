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

  // Replay protection: reject requests older than 5 minutes (300 seconds)
  const timestampSeconds = parseInt(timestamp, 10);
  const currentTimeSeconds = Math.floor(Date.now() / 1000);
  const timeDifference = currentTimeSeconds - timestampSeconds;
  
  if (timeDifference > 300) {
    throw new Error('Request timestamp too old (replay protection)');
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

  // Use timing-safe comparison to prevent timing attacks
  let isValid = false;
  for (const sig of sigs) {
    const sigHash = sig.substring(3);
    if (timingSafeEqual(signature_hex, sigHash)) {
      isValid = true;
      break;
    }
  }

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Parse the event JSON
  return JSON.parse(payload);
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
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
      
      case 'invoice.upcoming':
        await handleInvoiceUpcoming(event.data.object as any);
        break;
      
      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object as any);
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
  let subscription: any = null;
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

  // Update the subscription info including cancel_at_period_end
  await createOrUpdateUserSubscription(
    userId,
    tierId,
    subscription.customer,
    subscription.id,
    subscription.status,
    new Date(subscription.current_period_start * 1000),
    new Date(subscription.current_period_end * 1000),
    subscription.cancel_at_period_end || false
  );

  console.log(`Subscription updated for user ${userId}: ${subscription.status}, cancel_at_period_end: ${subscription.cancel_at_period_end}`);
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

async function handleInvoiceUpcoming(invoice: any) {
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) {
    return;
  }

  // This webhook is sent 3 days before renewal
  // We can use this to update metadata or trigger notifications
  // The frontend will automatically show "Expiring" based on date calculation
  
  // Use Stripe's official due_date field, fallback to period_end if not available
  const dueDateTimestamp = invoice.due_date || invoice.period_end;
  const dueDate = dueDateTimestamp ? new Date(dueDateTimestamp * 1000) : null;
  
  console.log(`Upcoming invoice for subscription ${subscriptionId}. Due: ${dueDate ? dueDate.toISOString() : 'Unknown'}`);
}

async function handleInvoiceFinalized(invoice: any) {
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) {
    return;
  }

  // Invoice is finalized and ready for payment attempt
  // Can be used for additional business logic if needed
  
  console.log(`Invoice finalized for subscription ${subscriptionId}. Amount: ${invoice.amount_due}`);
} 