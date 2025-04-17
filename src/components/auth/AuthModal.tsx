import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiAlertCircle } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
// import { FaApple } from 'react-icons/fa'; // Apple icon - commented out for now

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signInWithPassword, signUp, signInWithProvider } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthAction = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLoginView) {
        await signInWithPassword(email, password);
        // Supabase handles session update and AuthProvider context changes will re-render App
        onClose(); // Close modal on success
      } else {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        await signUp(email, password);
        // After signup, you might want to show a message like "Check your email for verification"
        // For now, just close the modal or switch to login view
        alert('Registration successful! Please check your email for verification.');
        setIsLoginView(true); // Switch to login view after successful registration
        // Keep modal open after registration for email verification message clarity
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSocialLogin = async (provider: 'google') => {
      setLoading(true);
      setError(null);
      try {
        await signInWithProvider(provider);
        // Redirect happens via Supabase config, modal might close before redirect completes
      } catch (err: any) {
        setError(err.message || `Failed to sign in with ${provider}.`);
        setLoading(false);
      }
    };


  // Reset form state when switching views or closing
  React.useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError(null);
      setLoading(false);
      // Optionally reset to login view when reopened
      // setIsLoginView(true); 
    }
  }, [isOpen]);
  
  React.useEffect(() => {
      setError(null); // Clear error when switching views
  }, [isLoginView]);

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0, 
      transition: { 
        type: "spring", 
        stiffness: 300, 
        damping: 30,
        delayChildren: 0.2,
        staggerChildren: 0.05 
      } 
    },
    exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } },
  };

  const childVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/10 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose} // Close when clicking backdrop
        >
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] border border-gray-100 dark:border-gray-700 p-6 sm:p-8 w-full max-w-md relative text-gray-900 dark:text-gray-100"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking modal content
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Close modal"
            >
              <FiX size={20} />
            </button>

            <motion.h2 
              className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-gray-100"
              variants={childVariants}
            >
              {isLoginView ? 'Welcome Back!' : 'Create Account'}
            </motion.h2>

            {/* Error Display */}
            {error && (
              <motion.div 
                className="mb-4 p-3.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-200 flex items-center gap-2.5"
                variants={childVariants}
              >
                <FiAlertCircle className="flex-shrink-0 text-red-500 dark:text-red-400" size={18}/>
                <span className="text-sm font-medium">{error}</span>
              </motion.div>
            )}
            
            {/* Social Logins */}
            <motion.div 
              className="mb-4"
              variants={childVariants}
            >
              <button
                onClick={() => handleSocialLogin('google')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
              >
                <FcGoogle size={22} />
                <span className="font-medium">{isLoginView ? 'Sign in with Google' : 'Sign up with Google'}</span>
              </button>
              {/* Apple button commented out for now
              <button
                onClick={() => handleSocialLogin('apple')}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-3 py-2.5 px-4 bg-black text-white border border-gray-800 rounded-xl text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
              >
                <FaApple size={22} />
                <span className="font-medium">{isLoginView ? 'Sign in with Apple' : 'Sign up with Apple'}</span>
              </button>
              */}
            </motion.div>

            {/* Divider */}
            <motion.div 
              className="flex items-center my-6"
              variants={childVariants}
            >
              <hr className="flex-grow border-t border-gray-200 dark:border-gray-700" />
              <span className="mx-4 text-sm font-medium text-gray-500 dark:text-gray-400">OR</span>
              <hr className="flex-grow border-t border-gray-200 dark:border-gray-700" />
            </motion.div>

            {/* Login/Register Form */}
            <motion.form 
              onSubmit={handleAuthAction} 
              className="space-y-4"
              variants={childVariants}
            >
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6} // Supabase default minimum
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>

              {!isLoginView && (
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="••••••••"
                    disabled={loading}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all"
              >
                {loading ? 'Processing...' : (isLoginView ? 'Login' : 'Register')}
              </button>
            </motion.form>

            {/* Toggle Link */}
            <motion.div 
              className="mt-6 text-center"
              variants={childVariants}
            >
              <button
                onClick={() => setIsLoginView(!isLoginView)}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline focus:outline-none transition-colors"
                disabled={loading}
              >
                {isLoginView ? 'Need an account? Register' : 'Already have an account? Login'}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal; 