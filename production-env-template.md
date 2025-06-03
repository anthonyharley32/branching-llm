# Production Environment Variables

## 📋 Replace these in your environment files:

### Supabase Edge Functions (.env)
```bash
# REPLACE TEST KEYS WITH LIVE KEYS:
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_LIVE_WEBHOOK_SECRET_HERE
FRONTEND_URL=https://yourdomain.com  # Your production URL
```

### Frontend (.env.local or .env.production)
```bash
# REPLACE TEST KEYS WITH LIVE KEYS:
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_PUBLISHABLE_KEY_HERE
VITE_API_URL=https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1
```

## 🔑 Where to Find Your Live Keys:

1. **Live Secret Key**: Stripe Dashboard > Developers > API keys > Secret key
2. **Live Publishable Key**: Stripe Dashboard > Developers > API keys > Publishable key
3. **Live Webhook Secret**: Stripe Dashboard > Developers > Webhooks > [Your webhook] > Signing secret

## ⚠️ CRITICAL SECURITY:
- NEVER commit live keys to version control
- Use environment variables or secure secret management
- Live keys start with `pk_live_` and `sk_live_`
- Test keys start with `pk_test_` and `sk_test_` 