import React, { useEffect, useState } from 'react';
import { PaymentService } from '../services/paymentService';
import { UsageLimit } from '../types/subscription';
import { FiAlertTriangle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

interface UsageTrackerProps {
  userId?: string;
  className?: string;
}

export const UsageTracker: React.FC<UsageTrackerProps> = ({ userId, className }) => {
  const [usageLimit, setUsageLimit] = useState<UsageLimit | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchUsage = async () => {
      if (!userId) return;
      
      try {
        const usage = await PaymentService.checkUsageLimit(userId);
        setUsageLimit(usage);
      } catch (error) {
        console.error('Error fetching usage:', error);
      }
    };

    fetchUsage();
    
    // Refresh usage every 60 seconds (less frequent since we only care about limits)
    const interval = setInterval(fetchUsage, 60000);
    
    return () => clearInterval(interval);
  }, [userId]);

  if (!usageLimit || dismissed) return null;

  const isAtLimit = !usageLimit.canSendMessage;
  const isUnlimited = usageLimit.dailyLimit === null;

  // Only show notification when user has actually hit their limit
  if (!isAtLimit || isUnlimited) return null;

  const getMessage = () => {
    return `Daily message limit reached (${usageLimit.currentUsage}/${usageLimit.dailyLimit}). ${
      usageLimit.tierName === 'Free' 
        ? 'Upgrade to Pro or Unlimited for more messages!' 
        : 'Your limit will reset tomorrow.'
    }`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`
          ${className || ''} 
          text-red-600 bg-red-50 border-red-200
          border rounded-lg p-3 mb-4 flex items-center gap-3 relative
        `}
      >
        <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {getMessage()}
          </p>
          {usageLimit.tierName === 'Free' && (
            <button className="text-xs underline mt-1 hover:no-underline">
              View upgrade options
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Simple inline usage display (for headers, etc.)
export const UsageDisplay: React.FC<{ userId?: string }> = ({ userId }) => {
  const [usageLimit, setUsageLimit] = useState<UsageLimit | null>(null);

  useEffect(() => {
    const fetchUsage = async () => {
      if (!userId) return;
      
      try {
        const usage = await PaymentService.checkUsageLimit(userId);
        setUsageLimit(usage);
      } catch (error) {
        console.error('Error fetching usage:', error);
      }
    };

    fetchUsage();
  }, [userId]);

  if (!usageLimit || !userId) return null;

  const isUnlimited = usageLimit.dailyLimit === null;
  const percentage = isUnlimited ? 0 : (usageLimit.currentUsage / (usageLimit.dailyLimit || 1)) * 100;

  return (
    <div className="text-xs text-gray-500 flex items-center gap-2">
      <span>
        {isUnlimited 
          ? `${usageLimit.currentUsage} messages` 
          : `${usageLimit.currentUsage}/${usageLimit.dailyLimit}`
        }
      </span>
      {!isUnlimited && (
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              percentage >= 100 ? 'bg-red-500' : 
              percentage >= 80 ? 'bg-orange-500' : 
              'bg-blue-500'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}; 