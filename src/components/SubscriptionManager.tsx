import React, { useState, useEffect } from 'react';
import { PaymentService } from '../services/paymentService';
import { UserSubscription, SubscriptionTier } from '../types/subscription';
import { useAuth } from '../context/AuthContext';
import { getExpirationMessage, isSubscriptionExpiring, getSubscriptionStatusColor, getSubscriptionStatusText } from '../utils/subscriptionUtils';

interface SubscriptionManagerProps {
  onUpgrade?: () => void;
}

export const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({ onUpgrade }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (user) {
      loadSubscription();
    }
  }, [user]);

  const loadSubscription = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const sub = await PaymentService.getUserSubscription(user.id);
      setSubscription(sub);
    } catch (error) {
      console.error('Failed to load subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    try {
      const { url } = await PaymentService.createPortalSession(user.id);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to open customer portal:', error);
      alert('Failed to open subscription management. Please try again.');
    }
  };

  const handleCancelSubscription = async () => {
    if (!user || !subscription) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.'
    );

    if (!confirmed) return;

    try {
      setCanceling(true);
      await PaymentService.cancelSubscription(user.id);
      await loadSubscription(); // Reload to get updated status
      alert('Subscription canceled successfully. You will retain access until the end of your billing period.');
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      alert('Failed to cancel subscription. Please try again or contact support.');
    } finally {
      setCanceling(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatPrice = (priceCents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(priceCents / 100);
  };





  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Subscription
        </h3>
        <div className="text-center py-8">
          <div className="text-gray-500 mb-4">
            You don't have an active subscription
          </div>
          <button
            onClick={onUpgrade}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            View Plans
          </button>
        </div>
      </div>
    );
  }

  const tier = subscription.tier as SubscriptionTier;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">
          Subscription
        </h3>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSubscriptionStatusColor(subscription)}`}>
          {getSubscriptionStatusText(subscription)}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <dt className="text-sm font-medium text-gray-500">Plan</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {tier?.name || 'Unknown Plan'}
          </dd>
        </div>

        {tier?.price_cents > 0 && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Price</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatPrice(tier.price_cents)}/month
            </dd>
          </div>
        )}

        <div>
          <dt className="text-sm font-medium text-gray-500">Message Limit</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {tier?.daily_message_limit === null ? 'Unlimited' : `${tier?.daily_message_limit} per day`}
          </dd>
        </div>

        {subscription.current_period_start && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Billing Period</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatDate(subscription.current_period_start)} - {subscription.current_period_end ? formatDate(subscription.current_period_end) : 'N/A'}
            </dd>
          </div>
        )}

        {isSubscriptionExpiring(subscription) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  {subscription.cancel_at_period_end ? 'Subscription Ending' : 
                   subscription.status === 'past_due' ? 'Payment Failed' :
                   subscription.status === 'incomplete' || subscription.status === 'unpaid' ? 'Payment Required' :
                   'Renewal Upcoming'}
                </h3>
                <div className="mt-1 text-sm text-yellow-700">
                  {getExpirationMessage(subscription)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex space-x-3">
        {subscription.status === 'active' && tier?.price_cents > 0 && (
          <button
            onClick={handleManageSubscription}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Manage Subscription
          </button>
        )}

        {subscription.status === 'active' && !subscription.cancel_at_period_end && tier?.price_cents > 0 && (
          <button
            onClick={handleCancelSubscription}
            disabled={canceling}
            className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {canceling ? 'Canceling...' : 'Cancel'}
          </button>
        )}

        {(subscription.status !== 'active' || tier?.price_cents === 0) && (
          <button
            onClick={onUpgrade}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Upgrade Plan
          </button>
        )}
      </div>
    </div>
  );
}; 