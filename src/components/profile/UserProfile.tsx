import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { UserProfile as UserProfileType } from '../../types/database';
import { FiUser, FiEdit, FiSave, FiX, FiCamera, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

interface UserProfileProps {
  onClose?: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ onClose }) => {
  const { user, session } = useAuth();
  
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Usage stats
  const [messageCount, setMessageCount] = useState<number>(0);
  const [isFetchingStats, setIsFetchingStats] = useState(false);
  
  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchMessageCount();
    } else {
      setLoading(false);
    }
  }, [user]);
  
  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setProfile(data as UserProfileType);
        setUsername(data.username || '');
        setAvatarUrl(data.avatar_url === undefined ? null : data.avatar_url);
      } else {
        // Create a new profile if one doesn't exist
        await createUserProfile();
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
      const newProfile = {
        user_id: user?.id,
        username: user?.email?.split('@')[0] || null, // Default username from email
        avatar_url: null,
        preferences: {}
      };
      
      const { data, error } = await supabase
        .from('user_profiles')
        .insert([newProfile])
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setProfile(data as UserProfileType);
        setUsername(data.username || '');
        setAvatarUrl(data.avatar_url === undefined ? null : data.avatar_url);
      }
    } catch (err: any) {
      console.error('Error creating user profile:', err);
      setError('Failed to create profile information');
    }
  };
  
  const fetchMessageCount = async () => {
    if (!user?.id) return;
    
    try {
      setIsFetchingStats(true);
      
      // This is a placeholder for your actual query
      // The actual implementation depends on your database schema
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('id')
        .eq('conversation:user_id', user.id);
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setMessageCount(data.length || 0);
      }
    } catch (err: any) {
      console.error('Error fetching message count:', err);
    } finally {
      setIsFetchingStats(false);
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
        username,
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
    
    try {
      setUploading(true);
      
      // Create a unique filename
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('user-assets')
        .upload(filePath, avatarFile);
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Get the public URL
      const { data } = supabase.storage
        .from('user-assets')
        .getPublicUrl(filePath);
        
      return data?.publicUrl || null;
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      setError('Failed to upload avatar');
      return null;
    } finally {
      setUploading(false);
    }
  };
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 24
      }
    }
  };
  
  if (!user) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p>Please sign in to view your profile</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-2xl w-full mx-auto relative">
      {/* Close button if in modal */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <FiX size={20} />
        </button>
      )}
      
      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            {isEditing ? 'Edit Profile' : 'User Profile'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            {user.email}
          </p>
        </motion.div>
        
        {/* Success/Error Messages */}
        {success && (
          <motion.div
            className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-200 flex items-center gap-2"
            variants={itemVariants}
          >
            <span className="text-sm font-medium">{success}</span>
          </motion.div>
        )}
        
        {error && (
          <motion.div
            className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-200 flex items-center gap-2"
            variants={itemVariants}
          >
            <FiAlertCircle className="flex-shrink-0 text-red-500 dark:text-red-400" size={18}/>
            <span className="text-sm font-medium">{error}</span>
          </motion.div>
        )}
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {/* Avatar Section */}
            <motion.div
              className="flex flex-col sm:flex-row items-center gap-6"
              variants={itemVariants}
            >
              <div className="relative group">
                <div className={`h-24 w-24 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden ${isEditing ? 'cursor-pointer' : ''}`}>
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="User avatar" 
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FiUser size={40} className="text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                
                {isEditing && (
                  <label className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <FiCamera size={24} className="text-white" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      disabled={uploading}
                    />
                  </label>
                )}
              </div>
              
              <div className="flex-1 space-y-4">
                <div>
                  {isEditing ? (
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        id="username"
                        value={username || ''}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Username</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {profile?.username || 'Not set'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
            
            {/* Usage Stats */}
            <motion.div
              className="mt-8 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl"
              variants={itemVariants}
            >
              <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">
                Usage Statistics
              </h3>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Messages Sent
                  </p>
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {isFetchingStats ? (
                      <span className="text-sm text-gray-400">Loading...</span>
                    ) : (
                      messageCount
                    )}
                  </p>
                </div>
                
                <div className="flex-1 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Limit
                  </p>
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    1,000 <span className="text-sm text-gray-400 font-normal">free messages</span>
                  </p>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="mt-4">
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full ${
                      messageCount > 800 ? 'bg-red-500' : 
                      messageCount > 500 ? 'bg-yellow-500' : 
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min((messageCount / 1000) * 100, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-right mt-1 text-gray-500 dark:text-gray-400">
                  {messageCount}/1,000 messages used
                </p>
              </div>
            </motion.div>
            
            {/* Account Details */}
            <motion.div
              className="mt-8"
              variants={itemVariants}
            >
              <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">
                Account Details
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Account Created
                  </p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Last Updated
                  </p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              </div>
            </motion.div>
            
            {/* Actions */}
            <motion.div
              className="mt-8 flex justify-end"
              variants={itemVariants}
            >
              {isEditing ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setUsername(profile?.username || '');
                      setAvatarUrl(profile?.avatar_url);
                      setAvatarFile(null);
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={loading || uploading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center gap-2"
                  >
                    {loading || uploading ? (
                      <>
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <FiSave size={18} />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center gap-2"
                >
                  <FiEdit size={18} />
                  <span>Edit Profile</span>
                </button>
              )}
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default UserProfile; 