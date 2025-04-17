import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { UserProfile as UserProfileType } from '../../types/database';
import { 
  FiUser, FiEdit, FiSave, FiX, FiCamera, FiAlertCircle, FiCreditCard, FiSettings, 
  FiSliders, FiDatabase, FiBox, FiSun, FiMoon, FiSmile, 
  FiMousePointer, FiDollarSign, FiEdit3 // Added specific icons
} from 'react-icons/fi';
import { motion } from 'framer-motion';

interface UserProfileProps {
  onClose?: () => void;
}

// Update Tab type for sidebar navigation
type ActiveSetting = 'account' | 'appearance' | 'behavior' | 'customize' | 'dataControls' | 'billing';

const UserProfile: React.FC<UserProfileProps> = ({ onClose }) => {
  const { user, session } = useAuth();
  
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

  useEffect(() => {
    if (user) {
      fetchUserProfile();
    } else {
      setLoading(false);
    }
  }, [user]);
  
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
        setProfile(data[0] as UserProfileType);
        setAvatarUrl(data[0].avatar_url || null);
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
        preferences: {}
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
        setProfile(data as UserProfileType);
        setAvatarUrl(data.avatar_url || null);
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
        newAvatarUrl = await uploadAvatar();
      }
      
      const updatedProfile = {
        avatar_url: newAvatarUrl,
        updated_at: new Date().toISOString()
      };
      
      const { error } = await supabase
        .from('user_profiles')
        .update(updatedProfile)
        .eq('id', profile.id);
      
      if (error) {
        throw error;
      }
      
      // Update local state
      setProfile({ ...profile, ...updatedProfile });
      setIsEditing(false);
      setSuccess('Profile updated successfully!');
      
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
  
  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;
    
    const fileExt = avatarFile.name.split('.').pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;
    console.log('Attempting to upload avatar with path:', filePath); // Log the path

    try {
      setUploading(true);
      setError(null); // Clear previous errors
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('user-assets')
        .upload(filePath, avatarFile);
      
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
  
  // --- MOCK DATA ---
  const subscriptionTier = user?.user_metadata?.subscription_tier || 'free';
  const userDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  // --- END MOCK DATA ---

  // Helper component for sidebar items
  const SidebarItem: React.FC<{ 
    setting: ActiveSetting; 
    icon: React.ElementType;
    label: string; 
  }> = ({ setting, icon: Icon, label }) => (
    <button
      onClick={() => setActiveSetting(setting)}
      className={`flex items-center w-full px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out ${ // Adjusted padding
        activeSetting === setting
          ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' // Adjusted active background
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-100' // Adjusted hover background
      }`}
    >
      <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
      <span>{label}</span>
    </button>
  );
  
  return (
    <div className="w-full flex"> {/* Removed minHeight style */}
      {/* Sidebar */} 
      <div className="w-60 border-r border-gray-200 dark:border-gray-700 p-4 flex flex-col shrink-0"> {/* Reduced width w-60 */} 
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6 px-2">Settings</h2>
        <nav className="flex-1 space-y-1">
          <SidebarItem setting="account" icon={FiUser} label="Account" />
          <SidebarItem setting="appearance" icon={FiEdit3} label="Appearance" /> {/* Updated Icon */} 
          <SidebarItem setting="behavior" icon={FiMousePointer} label="Behavior" /> {/* Updated Icon */} 
          <SidebarItem setting="customize" icon={FiSliders} label="Customize" />
          <SidebarItem setting="dataControls" icon={FiDatabase} label="Data Controls" />
          <SidebarItem setting="billing" icon={FiDollarSign} label="Billing" /> {/* Updated Icon */} 
        </nav>
      </div>

      {/* Content Area */} 
      <div className="flex-1 overflow-y-auto p-6 relative"> {/* Reduced padding p-6, added overflow-y-auto */} 
        {onClose && (
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-1 rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10" // Added z-10
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        )}

        {loading && activeSetting === 'account' && <p className="text-center text-gray-500 dark:text-gray-400">Loading account...</p>}
        
        {error && <p className="text-red-500 text-center mb-4">Error: {error}</p>}
        {success && <p className="text-green-500 text-center mb-4">{success}</p>}

        {/* Account Settings Content */} 
        {activeSetting === 'account' && profile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Account Details</h3>
            <div className="space-y-4"> {/* Reduced spacing */} 
              {/* User Info Section */} 
              <div className="flex items-center justify-between p-4 rounded-lg border border-transparent"> 
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center bg-gray-200 dark:bg-gray-600">
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
                    <p className="text-md font-semibold text-gray-900 dark:text-gray-100">{userDisplayName}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                  </div>
                </div>
                {!isEditing ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    // Adjusted styles to match target screenshot
                    className="px-4 py-1.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-850"
                  >
                    Manage
                  </button>
                 ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleSaveProfile}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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
                      className="px-4 py-1.5 text-sm font-medium rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-850"
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
                  <span className="text-md font-medium text-gray-900 dark:text-gray-100">Status</span>
                </div>
                {/* Adjusted styles to match target screenshot */}
                <span className={`px-3 py-0.5 text-sm font-medium rounded-full ${subscriptionTier === 'free' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'}`}>
                  {subscriptionTier === 'free' ? 'Free' : 'Premium+'} 
                </span>
              </div>

              {/* Language Section */} 
              <div className="flex items-center justify-between p-4 rounded-lg border border-transparent"> 
                <div className="flex items-center gap-2">
                  {/* ... Language Icon ... */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.06 7.94l-1.88-1.88M16.5 10.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0zm-1.5-1.82a4 4 0 00-5.36 0M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  <span className="text-md font-medium text-gray-900 dark:text-gray-100">Language</span>
                </div>
                <button 
                  onClick={() => console.log('Change Language')}
                  // Adjusted styles to match target screenshot
                  className="px-4 py-1.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-850"
                >
                  Change
                </button>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Appearance Settings Content (Placeholder) */} 
        {activeSetting === 'appearance' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Appearance</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">Theme settings (Light/Dark/System) would go here.</p>
              {/* Example Theme Toggle */} 
              <div className="mt-4 flex items-center gap-4">
                 <button className="flex items-center gap-2 p-2 rounded-md border border-gray-300 dark:border-gray-600"><FiSun/> Light</button>
                 <button className="flex items-center gap-2 p-2 rounded-md border border-gray-300 dark:border-gray-600"><FiMoon/> Dark</button>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Behavior Settings Content (Placeholder) */} 
        {activeSetting === 'behavior' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Behavior</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">Application behavior settings (e.g., notifications, startup) would go here.</p>
            </div>
          </motion.div>
        )}

        {/* Customize Settings Content (Placeholder) */} 
        {activeSetting === 'customize' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Customize</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">UI customization options would go here.</p>
            </div>
          </motion.div>
        )}

        {/* Data Controls Settings Content (Placeholder) */} 
        {activeSetting === 'dataControls' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Data Controls</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">Data privacy, export, and deletion settings would go here.</p>
            </div>
          </motion.div>
        )}
        
        {/* Billing Settings Content */} 
        {activeSetting === 'billing' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
             <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Billing</h3>
            {subscriptionTier === 'free' ? (
              // Free Tier View
              <div className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg text-center shadow-sm border border-gray-200 dark:border-gray-700 max-w-md mx-auto"> {/* Constrain width */} 
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">You are on the Free Plan</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                  Upgrade to unlock premium features and support the development of LearningLLM.
                </p>
                <button 
                  onClick={() => console.log('Navigate to upgrade/checkout page')} 
                  className="px-5 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-full shadow-md hover:shadow-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 dark:focus:ring-offset-gray-850"
                >
                  Upgrade to Premium+
                </button>
              </div>
            ) : (
              // Paid Tier View
              <div className="space-y-4 max-w-md"> {/* Constrain width */} 
                 <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700"> {/* Added border */} 
                   <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Current Plan</p>
                   <p className="text-md font-medium text-gray-900 dark:text-gray-100 capitalize">{subscriptionTier}</p>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Renews on: January 1, 2025</p>
                 </div>
                <div className="pt-2">
                  <button 
                    onClick={() => console.log('Navigate to billing management portal (e.g., Stripe)')} 
                    // Adjusted styles to match target screenshot
                    className="px-4 py-1.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-850"
                  >
                    Manage Subscription
                  </button>
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