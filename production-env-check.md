# Production Environment Variables Check

## 🚨 Required Variables for chatnavi.ai

Based on your Supabase project URL `btpxiwxlifxkkxcwgyug.supabase.co`, you need these exact environment variables:

### Frontend Environment Variables (.env.production or build config)
```bash
VITE_SUPABASE_URL=https://btpxiwxlifxkkxcwgyug.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
VITE_API_URL=https://btpxiwxlifxkkxcwgyug.supabase.co/functions/v1
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_PUBLISHABLE_KEY_HERE
```

## 🔑 How to Find Your Keys

### 1. Get Supabase Keys
1. Go to [Supabase Dashboard](https://dashboard.supabase.com)
2. Select your project
3. Go to **Settings** > **API**
4. Copy:
   - **Project URL**: `https://btpxiwxlifxkkxcwgyug.supabase.co`
   - **anon public key**: (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

### 2. Get Stripe Live Key
1. Go to [Stripe Dashboard](https://dashboard.stripe.com) (Live mode)
2. Go to **Developers** > **API keys**
3. Copy **Publishable key** (starts with `pk_live_`)

## 🚀 Deployment Platform Instructions

### For Netlify:
1. Go to Site settings > Environment variables
2. Add each variable above

### For Vercel:
1. Go to Project settings > Environment Variables
2. Add each variable above

### For Custom Hosting:
Make sure your build process includes these variables.

## 🧪 Test After Setting Variables

After setting the environment variables, your app should work. Test by:

1. **Refresh chatnavi.ai**
2. **Check Network tab** - no more 406 errors
3. **Try logging in** 
4. **Check if user profile loads**

## 🔍 Still Having Issues?

If you still get 406 errors after setting variables:

1. **Clear browser cache** completely
2. **Check browser console** for new error messages
3. **Verify environment variables** are actually being used (check Network tab requests) 