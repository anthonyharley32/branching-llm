import React, { useState, useEffect } from 'react';
import { PaymentService } from '../services/paymentService';
import { PricingPlan, DiscountCode } from '../types/subscription';
import { useAuth } from '../context/AuthContext';

interface PricingPageProps {
  onSelectPlan?: (plan: PricingPlan) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onSelectPlan }) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCode | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [appliedDiscount]);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const pricingPlans = await PaymentService.getPricingPlans(appliedDiscount?.code);
      setPlans(pricingPlans);
    } catch (error) {
      console.error('Failed to load pricing plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;

    try {
      setDiscountError('');
      const discount = await PaymentService.validateDiscountCode(discountCode);
      
      if (discount) {
        setAppliedDiscount(discount);
        setDiscountCode('');
      } else {
        setDiscountError('Invalid or expired discount code');
      }
    } catch (error) {
      setDiscountError('Failed to validate discount code');
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError('');
  };

  const handleSelectPlan = async (plan: PricingPlan) => {
    if (!user) {
      // Redirect to login or show login modal
      alert('Please log in to subscribe');
      return;
    }

    if (onSelectPlan) {
      onSelectPlan(plan);
      return;
    }

    try {
      setProcessingPlan(plan.tier.slug);
      
      if (plan.tier.price_cents === 0) {
        // Handle free tier
        const session = await PaymentService.createCheckoutSession(
          plan.tier.slug,
          user.id,
          appliedDiscount?.code
        );
        
        if (session.redirect) {
          window.location.href = session.redirect;
        }
      } else {
        // Handle paid tiers
        const session = await PaymentService.createCheckoutSession(
          plan.tier.slug,
          user.id,
          appliedDiscount?.code
        );
        
        if (session.url) {
          window.location.href = session.url;
        }
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start checkout process. Please try again.');
    } finally {
      setProcessingPlan(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const getFeatureList = (features: string[]) => {
    const featureMap: Record<string, string> = {
      basic_chat: 'Basic chat functionality',
      conversation_history: 'Conversation history',
      message_storage: 'Message storage',
      model_selection: 'Multiple AI models',
      unlimited_messages: 'Unlimited messages',
      reasoning_models: 'Advanced reasoning models',
    };

    return features.map(feature => featureMap[feature] || feature);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Choose Your Plan
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Start learning with AI today. Upgrade anytime.
          </p>
        </div>

        {/* Discount Code Section */}
        <div className="mt-8 max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Have a discount code?
            </h3>
            
            {appliedDiscount ? (
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-md">
                <div>
                  <span className="text-green-800 font-medium">
                    {appliedDiscount.code}
                  </span>
                  <span className="text-green-600 ml-2">
                    ({appliedDiscount.discount_percent}% off)
                  </span>
                </div>
                <button
                  onClick={handleRemoveDiscount}
                  className="text-green-600 hover:text-green-800"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  placeholder="Enter discount code"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleApplyDiscount}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Apply
                </button>
              </div>
            )}
            
            {discountError && (
              <p className="mt-2 text-sm text-red-600">{discountError}</p>
            )}
          </div>
        </div>

        {/* Pricing Plans */}
        <div className="mt-12 space-y-4 sm:mt-16 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto xl:max-w-none xl:mx-0 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.tier.slug}
              className={`border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-200 ${
                plan.popular ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <div className="p-6">
                {plan.popular && (
                  <span className="inline-flex px-4 py-1 rounded-full text-sm font-semibold tracking-wide uppercase bg-blue-100 text-blue-600">
                    Most Popular
                  </span>
                )}
                
                <h3 className="text-lg leading-6 font-medium text-gray-900 mt-2">
                  {plan.tier.name}
                </h3>
                
                <p className="mt-4 text-sm text-gray-500">
                  {plan.tier.description}
                </p>
                
                <p className="mt-8">
                  <span className="text-4xl font-extrabold text-gray-900">
                    {formatPrice(plan.price)}
                  </span>
                  {plan.tier.price_cents > 0 && (
                    <span className="text-base font-medium text-gray-500">
                      /month
                    </span>
                  )}
                </p>
                
                {plan.originalPrice && (
                  <p className="text-sm text-gray-500 line-through">
                    Originally {formatPrice(plan.originalPrice)}/month
                  </p>
                )}
                
                {plan.tier.daily_message_limit && (
                  <p className="mt-2 text-sm text-gray-600">
                    {plan.tier.daily_message_limit} messages per day
                  </p>
                )}
                
                {plan.tier.daily_message_limit === null && plan.tier.price_cents > 0 && (
                  <p className="mt-2 text-sm text-green-600 font-medium">
                    Unlimited messages
                  </p>
                )}
              </div>
              
              <div className="pt-6 pb-8 px-6">
                <h4 className="text-sm font-medium text-gray-900 tracking-wide uppercase">
                  What's included
                </h4>
                <ul className="mt-6 space-y-4">
                  {getFeatureList(plan.tier.features.features).map((feature) => (
                    <li key={feature} className="flex space-x-3">
                      <svg
                        className="flex-shrink-0 h-5 w-5 text-green-500"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm text-gray-500">{feature}</span>
                    </li>
                  ))}
                  
                  {plan.tier.features.models.length > 1 && (
                    <li className="flex space-x-3">
                      <svg
                        className="flex-shrink-0 h-5 w-5 text-green-500"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm text-gray-500">
                        Access to {plan.tier.features.models.join(', ')} models
                      </span>
                    </li>
                  )}
                </ul>
                
                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={processingPlan === plan.tier.slug}
                  className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md text-center font-medium ${
                    plan.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  } ${
                    processingPlan === plan.tier.slug
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }`}
                >
                  {processingPlan === plan.tier.slug ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </span>
                  ) : plan.tier.price_cents === 0 ? (
                    'Get Started Free'
                  ) : (
                    'Subscribe'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            All plans include a 30-day money-back guarantee. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}; 