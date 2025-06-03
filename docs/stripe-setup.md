# Stripe Payment Setup Guide

This guide will help you set up Stripe payments for your LearningLLM application.

## Prerequisites

1. A Stripe account (sign up at https://stripe.com)
2. Supabase project with edge functions enabled
3. Your Stripe API keys (publishable and secret)

## Step 1: Stripe Dashboard Configuration

### 1.1 Create Products and Prices

In your Stripe Dashboard, create the following products:

#### Pro Plan ($15/month)
- Product Name: "Pro Plan"
- Description: "Pro tier with model selection and unlimited messages"
- Price: $15.00 USD recurring monthly
- Copy the Price ID (starts with `price_`)

#### Unlimited Plan ($30/month)
- Product Name: "Unlimited Plan"
- Description: "Unlimited tier with reasoning models"
- Price: $30.00 USD recurring monthly
- Copy the Price ID (starts with `price_`)

### 1.2 Update Database with Stripe Price IDs

Run this SQL in your Supabase SQL editor:

```sql
-- Update Pro tier with Stripe price ID
UPDATE subscription_tiers 
SET stripe_price_id = 'price_YOUR_PRO_PRICE_ID_HERE'
WHERE slug = 'pro';

-- Update Unlimited tier with Stripe price ID
UPDATE subscription_tiers 
SET stripe_price_id = 'price_YOUR_UNLIMITED_PRICE_ID_HERE'
WHERE slug = 'unlimited';
```

### 1.3 Configure Webhooks

1. Go to Developers > Webhooks in your Stripe Dashboard
2. Click "Add endpoint"
3. Set the endpoint URL to: `https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/stripe-webhook`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook signing secret (starts with `whsec_`)

## Step 2: Environment Variables

### 2.1 Supabase Edge Functions

Create or update `supabase/.env`:

```env
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
FRONTEND_URL=http://localhost:5173
```

For production, use your live Stripe keys and production URL.

### 2.2 Frontend Environment

Create or update `.env.local`:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
VITE_API_URL=https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1
```

## Step 3: Deploy Edge Functions

Deploy the Stripe edge functions to Supabase:

```bash
# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```

## Step 4: Test the Integration

### 4.1 Test Webhook Endpoint

Use Stripe CLI to test webhooks locally:

```bash
# Install Stripe CLI
# Forward events to your local endpoint
stripe listen --forward-to https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/stripe-webhook

# Trigger test events
stripe trigger checkout.session.completed
```

### 4.2 Test Payment Flow

1. Start your development server
2. Navigate to the pricing page
3. Try subscribing to a paid plan
4. Use Stripe test card numbers:
   - Success: `4242424242424242`
   - Decline: `4000000000000002`

## Step 5: Production Setup

### 5.1 Switch to Live Mode

1. In Stripe Dashboard, toggle to "Live mode"
2. Create new products and prices (same as test mode)
3. Update environment variables with live keys
4. Update webhook endpoint to production URL
5. Update database with live price IDs

### 5.2 Configure Customer Portal

1. Go to Settings > Billing > Customer portal in Stripe Dashboard
2. Enable the features you want customers to access:
   - Update payment method
   - Download invoices
   - Cancel subscription
   - Update billing information

## Step 6: Usage Integration

### 6.1 Add Usage Tracking to Chat

In your chat component, add usage tracking:

```typescript
import { PaymentService } from '../services/paymentService';

// Before sending a message
const usageLimit = await PaymentService.checkUsageLimit(user?.id);
if (!usageLimit.canSendMessage) {
  // Show upgrade prompt
  return;
}

// After successful message
await PaymentService.incrementUsage(user?.id);
```

### 6.2 Add Components to Your App

Add the payment components to your application:

```typescript
import { PricingPage } from '../components/PricingPage';
import { UsageTracker } from '../components/UsageTracker';
import { SubscriptionManager } from '../components/SubscriptionManager';

// Use in your routes/components
<PricingPage />
<UsageTracker />
<SubscriptionManager />
```

## Discount Codes

The system includes built-in discount code support. You can create discount codes in the database:

```sql
INSERT INTO discount_codes (code, description, discount_percent, max_uses, is_active) 
VALUES ('BETA50', 'Beta tester 50% discount', 50, 100, true);
```

## Security Considerations

1. **Never expose secret keys** in frontend code
2. **Validate webhooks** using the signing secret
3. **Use HTTPS** in production
4. **Implement rate limiting** on your endpoints
5. **Log all payment events** for debugging

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**: Check the endpoint URL and ensure it's publicly accessible
2. **Invalid price ID**: Ensure the price IDs in your database match those in Stripe
3. **CORS errors**: Ensure your CORS headers are properly configured
4. **Authentication errors**: Verify your API keys are correct and have the right permissions

### Debug Mode

Enable debug logging in your edge functions:

```typescript
console.log('Stripe event:', event.type, event.data);
```

### Test Webhooks

Use the Stripe Dashboard's webhook testing tool to send test events to your endpoint.

## Support

For issues with:
- **Stripe integration**: Check Stripe documentation and logs
- **Supabase functions**: Check Supabase function logs
- **Database issues**: Check Supabase SQL editor and logs

## Next Steps

1. Set up monitoring and alerting for failed payments
2. Implement email notifications for subscription events
3. Add analytics tracking for conversion rates
4. Consider implementing usage-based billing for advanced features
5. Set up automated testing for the payment flow 