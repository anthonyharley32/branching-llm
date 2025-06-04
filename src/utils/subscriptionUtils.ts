import { UserSubscription } from '../types/subscription';

export const isSubscriptionExpiring = (subscription?: UserSubscription | null): boolean => {
  if (!subscription || !subscription.current_period_end) return false;
  
  const now = new Date();
  const periodEnd = new Date(subscription.current_period_end);
  const daysUntilExpiry = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  // Consider expiring if:
  // 1. Subscription is set to cancel at period end
  // 2. Subscription is past_due (payment failed)
  // 3. Active subscription with less than 7 days until renewal (including same day)
  // 4. Subscription status indicates payment issues
  // 5. Active subscription past expiry date (status not yet updated)
  return (
    subscription.cancel_at_period_end ||
    subscription.status === 'past_due' ||
    subscription.status === 'incomplete' ||
    subscription.status === 'unpaid' ||
    (subscription.status === 'active' && daysUntilExpiry <= 7)
  );
};

export const getSubscriptionStatusText = (subscription: UserSubscription | null): string => {
  if (isSubscriptionExpiring(subscription)) {
    return 'Expiring';
  }
  
  if (!subscription) return 'No Subscription';
  
  switch (subscription.status) {
    case 'active':
      return 'Active';
    case 'canceled':
      return 'Canceled';
    case 'past_due':
      return 'Past Due';
    case 'trialing':
      return 'Trial';
    case 'incomplete':
      return 'Incomplete';
    case 'incomplete_expired':
      return 'Expired';
    case 'unpaid':
      return 'Unpaid';
    default:
      return subscription.status;
  }
};

export const getSubscriptionStatusColor = (subscription?: UserSubscription | null): string => {
  if (isSubscriptionExpiring(subscription)) {
    return 'text-yellow-600 bg-yellow-100';
  }
  
  if (!subscription) return 'text-gray-600 bg-gray-100';
  
  switch (subscription.status) {
    case 'active':
      return 'text-green-600 bg-green-100';
    case 'canceled':
      return 'text-red-600 bg-red-100';
    case 'past_due':
      return 'text-yellow-600 bg-yellow-100';
    case 'trialing':
      return 'text-blue-600 bg-blue-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
};

export const getExpirationMessage = (subscription: UserSubscription): string | null => {
  if (!subscription.current_period_end) return null;
  
  const now = new Date();
  const periodEnd = new Date(subscription.current_period_end);
  const daysUntilExpiry = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };
  
  if (subscription.cancel_at_period_end) {
    return `Subscription will end on ${formatDate(subscription.current_period_end)}`;
  }
  
  if (subscription.status === 'past_due') {
    return `Payment failed. Subscription expires on ${formatDate(subscription.current_period_end)} without payment`;
  }
  
  if (subscription.status === 'incomplete' || subscription.status === 'unpaid') {
    return `Payment required to continue service. Expires on ${formatDate(subscription.current_period_end)}`;
  }
  
  if (subscription.status === 'active' && daysUntilExpiry <= 7 && daysUntilExpiry >= 0) {
    if (daysUntilExpiry === 0) {
      return `Subscription renews today on ${formatDate(subscription.current_period_end)}`;
    }
    return `Subscription renews in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} on ${formatDate(subscription.current_period_end)}`;
  }
  
  if (subscription.status === 'active' && daysUntilExpiry < 0) {
    return `Subscription expired ${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) !== 1 ? 's' : ''} ago on ${formatDate(subscription.current_period_end)}`;
  }
  
  return null;
};

export const getDaysUntilExpiry = (subscription: UserSubscription): number => {
  if (!subscription.current_period_end) return -1;
  
  const now = new Date();
  const periodEnd = new Date(subscription.current_period_end);
  return Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}; 