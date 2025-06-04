import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { UserProfile as UserProfileType } from '../../types/database';
import { PaymentService } from '../../services/paymentService'; // Add PaymentService import
import { 
  FiUser, FiCamera,
  FiSliders, FiDatabase, FiBox,  
  FiMousePointer, FiDollarSign, FiEdit3, FiCpu, FiMoon, FiSun // Added FiCpu, FiMoon, FiSun
} from 'react-icons/fi';
import { HiOutlineSparkles } from 'react-icons/hi'; // Import sparkles icon for AI stars logo
import { motion } from 'framer-motion';
import LLMSettings from '../LLMSettings'; // Import LLMSettings component

interface UserProfileProps {
  onClose?: () => void;
  onProfileUpdate: (newPrompt: string | null) => void;
}

// Update Tab type for sidebar navigation
type ActiveSetting = 'account' | 'appearance' | 'behavior' | 'customize' | 'dataControls' | 'billing' | 'models'; // Added 'models'

const UserProfile: React.FC<UserProfileProps> = ({ onProfileUpdate }) => {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Sidebar navigation state
  const [activeSetting, setActiveSetting] = useState<ActiveSetting>('account');
  
  // State for custom preferences
  const [highlightColor, setHighlightColor] = useState(() => 
    localStorage.getItem('branchHighlightColor') || '#f5f0a8'
  );
  // State for additional system prompt
  const [additionalSystemPrompt, setAdditionalSystemPrompt] = useState<string>('');
  // State to track the initial value for comparison
  const [initialAdditionalSystemPrompt, setInitialAdditionalSystemPrompt] = useState<string>('');



  // New state for subscription tier
  const [subscriptionTier, setSubscriptionTier] = useState<string>('free'); // Default to 'free'
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
interface SubscriptionData {
  id: string;
  status: 'trialing' | 'active' | 'past_due' | 'incomplete' | 'unpaid' | 'canceled' | 'incomplete_expired';
  current_period_end: string | null;       // ISO 8601 from Stripe
  cancel_at_period_end: boolean;
}

const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(
  null,
);
  // New state for processing payment
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  // Helper function to calculate background color based on theme and highlight color
  const getBackgroundColor = (highlightColor: string, theme: string): string => {
    if (theme === 'dark') {
      const rgb = highlightColor.match(/\w\w/g);
      if (rgb) {
        const [r, g, b] = rgb.map(hex => parseInt(hex, 16));
        return `rgba(${r}, ${g}, ${b}, 0.4)`;
      }
      return highlightColor;
    }
    return highlightColor;
  };

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchUserSubscription();
    } else {
      setLoading(false);
      setSubscriptionLoading(false);
    }
  }, [user]);
  
  const fetchUserSubscription = async () => {
    try {
      setSubscriptionLoading(true);
      const [usageLimit, fullSubscription] = await Promise.all([
        PaymentService.checkUsageLimit(user?.id),
        PaymentService.getUserSubscription(user?.id!)
      ]);
      setSubscriptionTier(usageLimit.tierSlug);
      setSubscriptionData(fullSubscription);
    } catch (err: any) {
      console.error('Error fetching user subscription:', err);
      // Default to free tier on error
      setSubscriptionTier('free');
      setSubscriptionData(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const fetchUserProfile = async (isRetry = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user?.id);
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        const userProfile = data[0] as UserProfileType;
        setProfile(userProfile);
        setAvatarUrl(userProfile.avatar_url || null);
        // Load additional system prompt from profile
        const loadedPrompt = userProfile.additional_system_prompt || '';
        setAdditionalSystemPrompt(loadedPrompt);
        setInitialAdditionalSystemPrompt(loadedPrompt); // Set initial value
      } else {
        // Create a new profile if one doesn't exist
        if (!isRetry) { // Prevent infinite loops
          await createUserProfile();
        } else {
          setError('Unable to create profile. Please contact support.');
        }
      }
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      setError('Failed to load profile information');
    } finally {
      setLoading(false);
    }
  };
  
  const createUserProfile = async () => {
    try {
      // Check if user exists in users table first
      const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();
      
      // If the user doesn't exist in users table, create it first
      if (userError && !existingUser) {
        const { error: insertUserError } = await supabase
          .from('users')
          .insert([{
            id: user?.id,
            email: user?.email
          }]);
        
        if (insertUserError) {
          console.error('Error inserting user:', insertUserError);
          // Continue anyway, the trigger might handle it
        }
      }
      
      // Get avatar URL from user metadata if available (for OAuth providers like Google)
      const avatarFromProvider = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
      
      const newProfile = {
        user_id: user?.id,
        avatar_url: avatarFromProvider || null,
        preferences: {},
        additional_system_prompt: additionalSystemPrompt,
      };
      
      // Try to upsert the profile - inserts if new, does nothing if user_id conflicts
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert(newProfile, { onConflict: 'user_id' }) // Use upsert on user_id conflict
        .select()
        .single();
      
      if (error && !(error.code === '23505' || (error as any).status === 409)) {
        // If it's an error *other* than a conflict (which upsert handles), throw it
        console.error('Error upserting user profile:', error);
        throw error;
      }
      
      // If data is returned (either from insert or existing row), update state
      if (data) {
        const userProfile = data as UserProfileType;
        setProfile(userProfile);
        setAvatarUrl(userProfile.avatar_url || null);
        // Ensure additional prompt state is initialized even for new profiles
        const loadedPrompt = userProfile.additional_system_prompt || '';
        setAdditionalSystemPrompt(loadedPrompt);
        setInitialAdditionalSystemPrompt(loadedPrompt); // Set initial value
      }
    } catch (err: any) {
      console.error('Error creating user profile:', err);
      setError('Failed to create profile information. Please try again later.');
    }
  };
  
  const handleSaveProfile = async () => {
    if (!profile) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Upload avatar if there's a new file
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        newAvatarUrl = await uploadAvatar(avatarFile);
      }
      
      const updatedProfile = {
        avatar_url: newAvatarUrl,
        updated_at: new Date().toISOString(),
        // Save additional system prompt - ensure profile object exists before spreading
        ...(profile && { preferences: profile.preferences }), // Keep existing preferences if any
        additional_system_prompt: additionalSystemPrompt, 
      };
      
      const { error } = await supabase
        .from('user_profiles')
        .update(updatedProfile)
        .eq('id', profile.id);
      
      if (error) {
        throw error;
      }
      
      // Update local state - ensure we merge correctly
      setProfile(prevProfile => prevProfile ? { ...prevProfile, ...updatedProfile } : null);
      setIsEditing(false);
      setSuccess('Profile updated successfully!');
      // Update the initial prompt state after successful save
      setInitialAdditionalSystemPrompt(additionalSystemPrompt);
      
      // Call the callback to update the parent component (App.tsx)
      if (onProfileUpdate) {
        onProfileUpdate(additionalSystemPrompt);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file is an image and under 2MB
      if (!file.type.includes('image')) {
        setError('Please upload an image file');
        return;
      }
      
      if (file.size > 2 * 1024 * 1024) {
        setError('Image must be under 2MB');
        return;
      }
      
      setAvatarFile(file);
      // Create a preview URL
      setAvatarUrl(URL.createObjectURL(file));
    }
  };
  
  const uploadAvatar = async (file: File): Promise<string | null> => {
    if (!file || !user) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;
    console.log('Attempting to upload avatar with path:', filePath); // Log the path

    try {
      setUploading(true);
      setError(null); // Clear previous errors
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('user-assets')
        .upload(filePath, file);
      
      if (uploadError) {
        console.error('Supabase upload error object:', uploadError); // Log the specific upload error
        throw uploadError; // Re-throw to be caught below
      }
      
      // Get the public URL - Assume error throws and will be caught
      const { data: urlResponseData } = supabase.storage
        .from('user-assets')
        .getPublicUrl(filePath);
        
      // Access publicUrl from the nested data object
      const publicUrl = urlResponseData?.publicUrl;
      console.log('Upload successful, public URL:', publicUrl);
      return publicUrl || null; // Return null if publicUrl is undefined/null

    } catch (err: any) {
      // Log the detailed error object from Supabase if available
      console.error('Error in uploadAvatar function:', err); 
      setError(`Failed to upload avatar: ${err.message || 'Unknown error'}`); // Provide more error context
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Handle checkout for subscription plans
  const handleCheckout = async (planSlug: string) => {
    if (!user) {
      alert('Please log in to subscribe');
      return;
    }

    try {
      setProcessingPlan(planSlug);
      
      const session = await PaymentService.createCheckoutSession(
        planSlug,
        user.id
      );
      
      if (session.url) {
        window.location.href = session.url;
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start checkout process. Please try again.');
    } finally {
      setProcessingPlan(null);
    }
  };





  // Handle immediate upgrade with proration for existing subscribers
  const handleUpgradeCheckout = async (planSlug: string) => {
    if (!user) {
      alert('Please log in to upgrade');
      return;
    }

    try {
      setProcessingPlan(planSlug);
      setError(null);
      setSuccess(null);
      
      // Check if user has an existing subscription
      if (subscriptionTier && subscriptionTier !== 'free' && subscriptionTier !== 'no-login') {
        // Existing subscriber - use proration
        const result = await PaymentService.changeSubscriptionPlan(user.id, planSlug, true);
        setSuccess(result.message);
        await fetchUserSubscription();
      } else {
        // New subscriber - use checkout
        const session = await PaymentService.createCheckoutSession(planSlug, user.id);
        if (session.url) {
          window.location.href = session.url;
        }
      }
    } catch (error) {
      console.error('Failed to upgrade:', error);
      setError('Failed to start upgrade process. Please try again.');
    } finally {
      setProcessingPlan(null);
    }
  };

  // Handle downgrade to a different plan with proration
  /* Commented out to fix TS6133 error - unused function
  const handleDowngrade = async (newPlanSlug: string) => {
    if (!user) {
      alert('Please log in to manage subscription');
      return;
    }

    const planName = newPlanSlug === 'pro' ? 'Pro' : 'Free';
    const confirmDowngrade = window.confirm(
      `Are you sure you want to downgrade to the ${planName} plan? This change will take effect at the end of your current billing period. No refund will be issued.`
    );

    if (!confirmDowngrade) return;

    try {
      setError(null);
      setSuccess(null);
      
      const result = await PaymentService.changeSubscriptionPlan(user.id, newPlanSlug, false);
      setSuccess(result.message);
      
      // Refresh subscription data
      await fetchUserSubscription();
      
    } catch (error) {
      console.error('Failed to downgrade subscription:', error);
      setError('Failed to downgrade subscription. Please try again or contact support.');
    }
  };
  */

  // --- MOCK DATA ---
  const userDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  // --- END MOCK DATA ---

  // Helper function to determine if subscription is expiring
  const isSubscriptionExpiring = (): boolean => {
    if (!subscriptionData || !subscriptionData.current_period_end || subscriptionTier === 'free') return false;
    
    const now = new Date();
    // Safe date creation - we've already checked current_period_end is not null above
    const periodEnd = new Date(subscriptionData.current_period_end);
    const daysUntilExpiry = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return (
      subscriptionData.cancel_at_period_end ||
      subscriptionData.status === 'past_due' ||
      subscriptionData.status === 'incomplete' ||
      subscriptionData.status === 'unpaid' ||
      (subscriptionData.status === 'active' && daysUntilExpiry <= 7 && daysUntilExpiry > 0)
    );
  };

  // Helper function to format subscription status and renewal date
  const getSubscriptionStatusText = () => {
    if (!subscriptionData || subscriptionTier === 'free') return null;
    
    const currentPeriodEnd = subscriptionData.current_period_end 
      ? new Date(subscriptionData.current_period_end).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : null;
    
    if (subscriptionData.cancel_at_period_end) {
      return `Expiring on ${currentPeriodEnd}`;
    }
    
    if (subscriptionData.status === 'past_due') {
      return `Payment failed - Expires on ${currentPeriodEnd}`;
    }
    
    if (subscriptionData.status === 'incomplete' || subscriptionData.status === 'unpaid') {
      return `Payment required - Expires on ${currentPeriodEnd}`;
    }
    
    if (subscriptionData.status === 'active' && currentPeriodEnd) {
      const now = new Date();
      // Safe null check - if current_period_end is null, we can't calculate days until expiry
      if (!subscriptionData.current_period_end) return null;
      
      const periodEnd = new Date(subscriptionData.current_period_end);
      const daysUntilExpiry = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
        return `Renews in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} on ${currentPeriodEnd}`;
      }
    }
    
    return currentPeriodEnd ? `Renews on ${currentPeriodEnd}` : 'Active';
  };

  // Helper component for sidebar items
  const SidebarItem: React.FC<{ 
    setting: ActiveSetting; 
    icon: React.ElementType;
    label: string; 
  }> = ({ setting, icon: Icon, label }) => (
    <button
      onClick={() => setActiveSetting(setting)}
      className={`flex items-center w-full px-4 py-3 rounded-md text-base font-medium transition-colors duration-150 ease-in-out ${ // Changed text-sm to text-base and increased py-2 to py-3
        activeSetting === setting
          ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' // Adjusted active background
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700' // Adjusted hover background
      }`}
    >
      <Icon className="mr-3 h-6 w-6 flex-shrink-0" /> {/* Increased icon size from h-5 w-5 to h-6 w-6 */}
      <span>{label}</span>
    </button>
  );
  
  return (
    <div className="w-full flex"> {/* Removed minHeight style */}
      {/* Sidebar */} 
      <div className="w-60 border-r border-gray-200 dark:border-gray-700 p-4 flex flex-col shrink-0"> {/* Reduced width w-60 */} 
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 px-2">Settings</h2> {/* Changed from text-lg to text-xl */}
        <nav className="flex-1 space-y-2"> {/* Changed from space-y-1 to space-y-2 */}
          <SidebarItem setting="account" icon={FiUser} label="Account" />
          <SidebarItem setting="appearance" icon={FiEdit3} label="Appearance" /> {/* Updated Icon */} 
          <SidebarItem setting="behavior" icon={FiMousePointer} label="Behavior" /> {/* Updated Icon */} 
          <SidebarItem setting="models" icon={FiCpu} label="Models" /> {/* Added Models Tab */}
          <SidebarItem setting="customize" icon={FiSliders} label="Customize" />
          <SidebarItem setting="dataControls" icon={FiDatabase} label="Data Controls" />
          {/* Conditionally render the billing tab based on subscription tier */}
          <SidebarItem 
            setting="billing" 
            icon={subscriptionTier === 'free' ? HiOutlineSparkles : FiDollarSign} 
            label={subscriptionTier === 'free' ? "Upgrade" : "Billing"} 
          />
        </nav>
      </div>

      {/* Content Area */} 
      <div className="flex-1 overflow-y-auto p-6 relative"> {/* Reduced padding p-6, added overflow-y-auto */}

        {loading && activeSetting === 'account' && <p className="text-center text-gray-500 dark:text-gray-400">Loading account...</p>}
        
        {error && <p className="text-red-500 dark:text-red-400 text-center mb-4">Error: {error}</p>}
        {success && <p className="text-green-500 dark:text-green-400 text-center mb-4">{success}</p>}

        {/* Account Settings Content */} 
        {activeSetting === 'account' && profile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Account Details</h3>
            <div className="space-y-4"> {/* Reduced spacing */} 
              {/* User Info Section */} 
              <div className="flex items-center justify-between p-4 rounded-lg border border-transparent"> 
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <FiUser className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                      )}
                    </div>
                    {isEditing && (
                      <label htmlFor="avatar-upload" className="absolute -bottom-1 -right-1 bg-blue-500 text-white p-1 rounded-full cursor-pointer hover:bg-blue-600 transition-colors shadow-sm">
                        <FiCamera className="w-2.5 h-2.5" />
                        <input 
                          id="avatar-upload" 
                          type="file" 
                          accept="image/*" 
                          onChange={handleAvatarChange} 
                          className="sr-only" 
                          disabled={uploading}
                        />
                      </label>
                    )}
                  </div>
                  <div>
                    <p className="text-md font-semibold text-gray-900 dark:text-white">{userDisplayName}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                  </div>
                </div>
                {!isEditing ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    // Adjusted styles to match target screenshot
                    className="px-4 py-1.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-gray-500 cursor-pointer"
                  >
                    Manage
                  </button>
                 ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleSaveProfile}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                      disabled={loading || uploading}
                    >
                      {loading || uploading ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      onClick={() => {
                        setIsEditing(false);
                        setAvatarUrl(profile.avatar_url || null);
                        setAvatarFile(null);
                        setError(null);
                      }}
                      className="px-4 py-1.5 text-sm font-medium rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-gray-500 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                 )}
              </div>
              {uploading && <p className="text-xs text-blue-500 pl-16">Uploading...</p>} 

              {/* Status Section */} 
              <div className="flex items-center justify-between p-4 rounded-lg border border-transparent"> 
                <div className="flex items-center gap-2">
                  <FiBox className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <span className="text-md font-medium text-gray-900 dark:text-white">Status</span>
                </div>
                {/* Adjusted styles to match target screenshot */}
                {subscriptionLoading ? (
                  <span className="px-3 py-0.5 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    Loading...
                  </span>
                ) : (
                  <span className={`px-3 py-0.5 text-sm font-medium rounded-full ${
                    subscriptionTier === 'free' || subscriptionTier === 'no-login' 
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' 
                      : subscriptionTier === 'pro'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                      : 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
                  }`}>
                    {subscriptionTier === 'no-login' ? 'Guest' : 
                     subscriptionTier === 'free' ? 'Free' : 
                     subscriptionTier === 'pro' ? 'Pro' : 
                     subscriptionTier === 'unlimited' ? 'Unlimited' : 'Unknown'} 
                  </span>
                )}
              </div>

              {/* Language Section */} 
              <div className="flex items-center justify-between p-4 rounded-lg border border-transparent"> 
                <div className="flex items-center gap-2">
                  {/* ... Language Icon ... */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.06 7.94l-1.88-1.88M16.5 10.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0zm-1.5-1.82a4 4 0 00-5.36 0M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  <span className="text-md font-medium text-gray-900 dark:text-white">Language</span>
                </div>
                <button 
                  onClick={() => console.log('Change Language')}
                  // Adjusted styles to match target screenshot
                  className="px-4 py-1.5 text-sm font-medium rounded-full border border-gray-200 text-gray-700 bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Appearance Settings Content */} 
        {activeSetting === 'appearance' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Appearance</h3>
            <div className="space-y-4">
              {/* Dark Mode Toggle */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Theme</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <FiMoon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                    ) : (
                      <FiSun className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {theme === 'dark' 
                          ? 'Dark backgrounds with light text for reduced eye strain'
                          : 'Light backgrounds with dark text for enhanced readability'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTheme('light')}
                      className={`p-2 rounded-md transition-colors ${
                        theme === 'light'
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                      title="Light mode"
                    >
                      <FiSun className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`p-2 rounded-md transition-colors ${
                        theme === 'dark'
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                      title="Dark mode"
                    >
                      <FiMoon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Text Selection Highlight Color - Moved from Customize tab */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Text Selection</h4>
                
                <div className="space-y-4">
                  {/* Branch Highlight Color Selection */}
                  <div className="flex flex-col">
                    <label htmlFor="highlight-color" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Branch Selection Highlight Color
                    </label>
                    <div className="flex items-center space-x-4">
                      <input 
                        type="color" 
                        id="highlight-color" 
                        value={highlightColor}
                        className="w-10 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                        onChange={(e) => {
                          const newColor = e.target.value;
                          // Update state 
                          setHighlightColor(newColor);
                          
                          // Update stored preference in localStorage
                          localStorage.setItem('branchHighlightColor', newColor);
                          
                          // Update CSS variables for both light and dark mode
                          document.documentElement.style.setProperty('--branch-highlight-color', newColor);
                          
                          // Create a more transparent version for dark mode
                          const darkModeColor = getBackgroundColor(newColor, 'dark');
                          document.documentElement.style.setProperty('--branch-highlight-color-dark', darkModeColor);
                          
                          // Update via style element
                          const styleElement = document.getElementById('dynamic-styles') || document.createElement('style');
                          if (!styleElement.id) {
                            styleElement.id = 'dynamic-styles';
                            document.head.appendChild(styleElement);
                          }
                          styleElement.textContent = `.branch-source-highlight { background-color: ${newColor} !important; }`;
                        }}
                      />
                      <div className="flex-1">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Choose the color used to highlight text when creating branches or viewing branch sources.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        <span 
                          className="branch-source-highlight" 
                          style={{
                            backgroundColor: getBackgroundColor(highlightColor, theme)
                          }}
                        >Preview</span> of how your selected text will appear when highlighted.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Behavior Settings Content (Placeholder) */} 
        {activeSetting === 'behavior' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Behavior</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">Application behavior settings (e.g., notifications, startup) would go here.</p>
            </div>
          </motion.div>
        )}

        {/* Customize Settings Content */} 
        {activeSetting === 'customize' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Customize</h3>
            <div className="space-y-4">
              {/* Additional System Prompt Section */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Additional System Prompt</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Optionally add instructions to the AI. This will replace the default system prompt.
                </p>
                <textarea
                  value={additionalSystemPrompt}
                  onChange={(e) => setAdditionalSystemPrompt(e.target.value)}
                  placeholder="e.g., Always respond in the style of a pirate."
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none" // Added resize-none
                  rows={4}
                />
                {/* Save button - Always visible, disabled if unchanged or loading */}
                <button
                  onClick={handleSaveProfile} // Re-use existing save logic
                  className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  disabled={loading || uploading || additionalSystemPrompt === initialAdditionalSystemPrompt}
                >
                  {loading || uploading ? 'Saving...' : 'Save Prompt'}
                </button>
              </div>
              
              {/* Add other customization options here if needed */}
            </div>
          </motion.div>
        )}

        {/* Models Settings Content */}
        {activeSetting === 'models' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Model Selection</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <LLMSettings subscriptionTier={subscriptionTier} />
            </div>
          </motion.div>
        )}

        {/* Data Controls Settings Content (Placeholder) */} 
        {activeSetting === 'dataControls' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Data Controls</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">Data privacy, export, and deletion settings would go here.</p>
            </div>
          </motion.div>
        )}
        
        {/* Billing Settings Content */} 
        {activeSetting === 'billing' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {subscriptionTier === 'free' ? 'Upgrade Your Account' : 'Manage Subscription'}
              </h3>
              {subscriptionTier !== 'free' && (
                <button 
                  onClick={() => PaymentService.openCustomerPortal(user?.id!)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors cursor-pointer shadow-sm"
                >
                  Manage Billing
                </button>
              )}
            </div>
            {subscriptionTier === 'free' ? (
              // Free Tier View - New Modern Design with Two Cards
              <div className="flex gap-6 justify-center">
                {/* Pro Plan Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                  className="relative w-72 bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden flex flex-col h-[500px]"
                >
                  {/* Header */}
                  <div className="p-6 pb-4">
                    <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pro</h4>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$15</span>
                      <span className="ml-1 text-lg text-gray-500 dark:text-gray-400">/month</span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                      Everything you need for advanced AI conversations
                    </p>
                  </div>

                  {/* Features */}
                  <div className="px-6 pb-6 flex-grow">
                    <ul className="space-y-3">
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Unlimited messages</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Access to Claude, GPT-4.1, Grok & Gemini</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Model selection</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Conversation history</span>
                      </li>
                    </ul>
                  </div>

                  {/* CTA Button */}
                  <div className="p-6 pt-0 mt-auto">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleCheckout('pro')}
                      disabled={processingPlan === 'pro'}
                      className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {processingPlan === 'pro' ? 'Processing...' : 'Choose Pro'}
                    </motion.button>
                  </div>
                </motion.div>

                {/* Unlimited Plan Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                  className="relative w-72 bg-gradient-to-b from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30 rounded-2xl border-2 border-purple-400 dark:border-purple-600 shadow-xl overflow-hidden flex flex-col h-[500px]"
                >
                  {/* Popular Badge */}
                  <div className="absolute top-4 right-4">
                    <span className="px-3 py-1 text-xs font-bold text-purple-800 dark:text-purple-200 bg-purple-200 dark:bg-purple-800/50 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>

                  {/* Header */}
                  <div className="p-6 pb-4">
                    <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unlimited</h4>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$30</span>
                      <span className="ml-1 text-lg text-gray-500 dark:text-gray-400">/month</span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                      Premium features with advanced reasoning
                    </p>
                  </div>

                  {/* Features */}
                  <div className="px-6 pb-6 flex-grow">
                    <ul className="space-y-3">
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Everything in Pro, plus:</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Claude 3.7 Sonnet (Thinking)</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">OpenAI o4-mini & Grok 3 Reasoning</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Claude 4 Opus & Gemini 2.5 Pro</span>
                      </li>
                    </ul>
                  </div>

                  {/* CTA Button */}
                  <div className="p-6 pt-0 mt-auto">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleCheckout('unlimited')}
                      disabled={processingPlan === 'unlimited'}
                      className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {processingPlan === 'unlimited' ? 'Processing...' : 'Choose Unlimited'}
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            ) : subscriptionTier === 'pro' ? (
              // Pro Tier View - Show upgrade to Unlimited + current plan info
              <div className="space-y-6">
                {/* Current Plan & Upgrade Cards */}
                <div className="flex gap-6 justify-center">
                  {/* Current Pro Plan Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, type: "spring", stiffness: 200 }}
                    className="relative w-72 bg-gradient-to-b from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/30 rounded-2xl border-2 border-blue-400 dark:border-blue-600 shadow-lg overflow-hidden"
                  >
                    {/* Current Plan Badge */}
                    <div className="absolute top-4 right-4">
                      <span className="px-3 py-1 text-xs font-bold text-blue-800 dark:text-blue-200 bg-blue-200 dark:bg-blue-800/50 rounded-full">
                        CURRENT PLAN
                      </span>
                    </div>

                    {/* Header */}
                    <div className="p-6 pb-4">
                      <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pro Plan</h4>
                      <div className="flex items-baseline">
                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$15</span>
                        <span className="ml-1 text-lg text-gray-500 dark:text-gray-400">/month</span>
                      </div>
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        {getSubscriptionStatusText() || 'Active'}
                      </p>
                      <div className="flex items-center mt-2">
                        <div className={`w-2 h-2 rounded-full mr-2 ${isSubscriptionExpiring() ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                        <span className={`text-sm font-medium ${isSubscriptionExpiring() ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                          {isSubscriptionExpiring() ? 'Expiring' : 'Active'}
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="px-6 pb-6">
                      <ul className="space-y-3">
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Unlimited messages</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Access to Claude, GPT-4.1, Grok & Gemini</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Model selection</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Conversation history</span>
                        </li>
                      </ul>
                    </div>
                  </motion.div>

                  {/* Upgrade to Unlimited Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                    whileHover={{ y: -5, transition: { duration: 0.2 } }}
                    className="relative w-72 bg-gradient-to-b from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30 rounded-2xl border-2 border-purple-400 dark:border-purple-600 shadow-xl overflow-hidden"
                  >
                    {/* Upgrade Badge */}
                    <div className="absolute top-4 right-4">
                      <span className="px-3 py-1 text-xs font-bold text-purple-800 dark:text-purple-200 bg-purple-200 dark:bg-purple-800/50 rounded-full">
                        UPGRADE
                      </span>
                    </div>

                    {/* Header */}
                    <div className="p-6 pb-4">
                      <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unlimited Plan</h4>
                      <div className="flex items-baseline">
                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$30</span>
                        <span className="ml-1 text-lg text-gray-500 dark:text-gray-400">/month</span>
                      </div>
                      <p className="mt-3 text-sm text-purple-600 dark:text-purple-400 font-medium">
                        Upgrade for advanced reasoning models
                      </p>
                    </div>

                    {/* Features */}
                    <div className="px-6 pb-6">
                      <ul className="space-y-3">
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Everything in Pro, plus:</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Claude 3.7 Sonnet (Thinking)</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">OpenAI o4-mini & Grok 3 Reasoning</span>
                        </li>
                                              <li className="flex items-start">
                        <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Claude 4 Opus & Gemini 2.5 Pro</span>
                      </li>
                      </ul>
                    </div>

                    {/* CTA Button */}
                    <div className="p-6 pt-0">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleUpgradeCheckout('unlimited')}
                        disabled={processingPlan === 'unlimited'}
                        className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {processingPlan === 'unlimited' ? 'Processing...' : 'Upgrade to Unlimited'}
                      </motion.button>
                    </div>
                  </motion.div>
                </div>


              </div>
            ) : (
              // Unlimited Tier View - Show current plan info + downgrade/cancel options
              <div className="space-y-6">
                {/* Current Plan Info */}
                <div className="flex justify-center">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, type: "spring", stiffness: 200 }}
                    className="relative w-80 bg-gradient-to-b from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30 rounded-2xl border-2 border-purple-400 dark:border-purple-600 shadow-lg overflow-hidden"
                  >
                    {/* Current Plan Badge */}
                    <div className="absolute top-4 right-4">
                      <span className="px-3 py-1 text-xs font-bold text-purple-800 dark:text-purple-200 bg-purple-200 dark:bg-purple-800/50 rounded-full">
                        CURRENT PLAN
                      </span>
                 </div>

                    {/* Header */}
                    <div className="p-6 pb-4">
                      <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unlimited Plan</h4>
                      <div className="flex items-baseline">
                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$30</span>
                        <span className="ml-1 text-lg text-gray-500 dark:text-gray-400">/month</span>
                      </div>
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        {getSubscriptionStatusText() || 'Active'}
                      </p>
                      <div className="flex items-center mt-2">
                        <div className={`w-2 h-2 rounded-full mr-2 ${isSubscriptionExpiring() ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                        <span className={`text-sm font-medium ${isSubscriptionExpiring() ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                          {isSubscriptionExpiring() ? 'Expiring' : 'Active'}
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="px-6 pb-6">
                      <ul className="space-y-3">
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Everything in Pro, plus:</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Claude 3.7 Sonnet (Thinking)</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">OpenAI o4-mini & Grok 3 Reasoning</span>
                        </li>
                        <li className="flex items-start">
                          <svg className="h-5 w-5 text-purple-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Claude 4 Opus & Gemini 2.5 Pro</span>
                        </li>
                      </ul>
                    </div>
                  </motion.div>
                </div>


              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default UserProfile; 