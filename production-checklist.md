# 🚀 Production Deployment Checklist

## Stripe Setup
- [X] ✅ Stripe account activated with business details
- [X] ✅ Bank account added for payouts
- [X] ✅ Switch to Live mode in Stripe Dashboard
- [X] ✅ Create Pro Plan product ($15/month) - get price ID
- [X] ✅ Create Unlimited Plan product ($30/month) - get price ID
- [X] ✅ Update database with live price IDs (run production-setup.sql)
- [ ] ✅ Configure live webhook endpoint
- [ ] ✅ Copy live webhook signing secret
- [ ] ✅ Configure customer portal settings

## Environment Variables
- [X] ✅ Update STRIPE_SECRET_KEY (sk_live_...)
- [ ] ✅ Update STRIPE_WEBHOOK_SECRET (whsec_...)
- [X] ✅ Update VITE_STRIPE_PUBLISHABLE_KEY (pk_live_...)
- [ ] ✅ Update FRONTEND_URL to production domain
- [ ] ✅ Secure storage of live keys (no git commits!)

## Deployment
- [ ] ✅ Deploy updated edge functions: `supabase functions deploy`
- [ ] ✅ Deploy frontend with production environment variables
- [ ] ✅ Verify webhook endpoint is accessible
- [ ] ✅ Test SSL certificate on production domain

## Testing (Use Real Payment Methods)
- [ ] ✅ Test successful payment flow
- [ ] ✅ Test subscription management
- [ ] ✅ Test customer portal access
- [ ] ✅ Test webhook events (subscription updates)
- [ ] ✅ Test usage limits and tracking
- [ ] ✅ Verify email notifications work

## Security & Compliance
- [ ] ✅ Verify HTTPS on all endpoints
- [ ] ✅ Confirm webhook signature validation
- [ ] ✅ Test CORS configuration
- [ ] ✅ Verify user authentication on payment endpoints
- [ ] ✅ Check for any exposed sensitive data in logs

## Monitoring & Alerts
- [ ] ✅ Set up payment failure monitoring
- [ ] ✅ Monitor webhook delivery in Stripe Dashboard
- [ ] ✅ Set up alerts for failed payments
- [ ] ✅ Monitor Supabase function logs
- [ ] ✅ Test error handling and user feedback

## Go-Live
- [ ] ✅ Remove any test/beta messaging from UI
- [ ] ✅ Update terms of service and privacy policy
- [ ] ✅ Enable production analytics
- [ ] ✅ Announce to users
- [ ] ✅ Monitor first few transactions closely

## ⚠️ Critical Reminders:
- Real money will be processed - double-check everything!
- Test with small amounts first
- Have a rollback plan ready
- Monitor closely for the first 24 hours 