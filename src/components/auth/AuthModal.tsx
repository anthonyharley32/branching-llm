import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiAlertCircle, FiMail, FiCheckCircle } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
// import { FaApple } from 'react-icons/fa'; // Apple icon - commented out for now

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signInWithPassword, signUp, signInWithProvider } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
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
        // Show success screen instead of alert
        setRegisteredEmail(email);
        setShowSuccessScreen(true);
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

  const handleBackToLogin = () => {
    setShowSuccessScreen(false);
    setIsLoginView(true);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setRegisteredEmail('');
    setError(null);
  };

  // Reset form state when switching views or closing
  React.useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError(null);
      setLoading(false);
      setShowSuccessScreen(false);
      setRegisteredEmail('');
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

  // Success screen JSX
  const SuccessScreen = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="text-center"
    >
      <div className="mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 20,
            delay: 0.2 
          }}
          className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg"
        >
          <FiCheckCircle size={36} className="text-white" />
        </motion.div>
        
        <motion.h2 
          className="text-3xl font-bold text-gray-800 mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Welcome aboard! 🎉
        </motion.h2>
        
        <motion.p 
          className="text-gray-600 text-lg mb-8 leading-relaxed"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          Your account has been created successfully.
        </motion.p>
      </div>

      <motion.div 
        className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/50 rounded-2xl p-6 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <FiMail size={24} className="text-blue-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-800 text-lg">Check your email</h3>
            <p className="text-gray-600 text-sm">We've sent a verification link to</p>
          </div>
        </div>
        
        <div className="bg-white/80 rounded-xl p-4 border border-blue-200/30">
          <p className="font-mono text-sm text-blue-700 break-all">{registeredEmail}</p>
        </div>
        
        <p className="text-gray-500 text-sm mt-4 leading-relaxed">
          Click the verification link in your email to activate your account and start chatting!
        </p>
      </motion.div>

      <motion.div 
        className="space-y-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <button
          onClick={handleBackToLogin}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 cursor-pointer"
        >
          Continue to Login
        </button>
        
        <button
          onClick={onClose}
          className="w-full py-3 px-4 text-gray-500 hover:text-gray-700 font-medium transition-colors duration-200 cursor-pointer"
        >
          I'll verify later
        </button>
      </motion.div>
    </motion.div>
  );

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
            className="bg-white rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-gray-100 p-6 sm:p-8 w-full max-w-md relative text-gray-900"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e: React.MouseEvent) => e.stopPropagation()} // Prevent closing when clicking modal content
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 cursor-pointer"
              aria-label="Close modal"
            >
              <FiX size={20} />
            </button>

            {/* Show success screen or auth form */}
            {showSuccessScreen ? (
              <SuccessScreen />
            ) : (
              <>
                <motion.h2 
                  className="text-2xl font-bold text-center mb-6 text-gray-800"
                  variants={childVariants}
                >
                  {isLoginView ? 'Welcome Back!' : 'Create Account'}
                </motion.h2>

                {/* Error Display */}
                {error && (
                  <motion.div 
                    className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2.5"
                    variants={childVariants}
                  >
                    <FiAlertCircle className="flex-shrink-0 text-red-500" size={18}/>
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
                    className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm hover:shadow-md cursor-pointer"
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
                  <hr className="flex-grow border-t border-gray-200" />
                  <span className="mx-4 text-sm font-medium text-gray-500">OR</span>
                  <hr className="flex-grow border-t border-gray-200" />
                </motion.div>

                {/* Login/Register Form */}
                <motion.form 
                  onSubmit={handleAuthAction} 
                  className="space-y-4"
                  variants={childVariants}
                >
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black bg-white text-gray-900 placeholder-gray-400"
                      placeholder="you@example.com"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-gray-700 mb-1.5"
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
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black bg-white text-gray-900 placeholder-gray-400"
                      placeholder="••••••••"
                      disabled={loading}
                    />
                  </div>

                  {!isLoginView && (
                    <div>
                      <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium text-gray-700 mb-1.5"
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
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black bg-white text-gray-900 placeholder-gray-400"
                        placeholder="••••••••"
                        disabled={loading}
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-black hover:bg-gray-900 text-white font-medium rounded-xl shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 transition-all cursor-pointer"
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
                    className="text-sm font-medium text-black hover:text-gray-800 hover:underline focus:outline-none transition-colors cursor-pointer"
                    disabled={loading}
                  >
                    {isLoginView ? 'Need an account? Register' : 'Already have an account? Login'}
                  </button>
                </motion.div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal; 