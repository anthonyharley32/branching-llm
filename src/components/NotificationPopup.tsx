import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';

interface NotificationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  actionButton?: {
    text: string;
    onClick: () => void;
  };
}

const NotificationPopup: React.FC<NotificationPopupProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  actionButton 
}) => {
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0, 
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 25,
        mass: 0.8
      } 
    },
    exit: { 
      opacity: 0, 
      scale: 0.9, 
      y: 20, 
      transition: { 
        duration: 0.15,
        ease: "easeInOut"
      } 
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)] border border-gray-200/50 dark:border-gray-700/50 p-8 w-full max-w-md mx-4 relative text-gray-900 dark:text-gray-100 backdrop-blur-xl"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-200 p-2 rounded-full hover:bg-gray-100/80 dark:hover:bg-gray-800/50 cursor-pointer group"
              aria-label="Close notification"
            >
              <FiX size={20} className="group-hover:scale-110 transition-transform duration-200" />
            </button>

            {/* Title */}
            <div className="mb-6 pr-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {title}
              </h2>
            </div>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed text-base">
              {message}
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-6 py-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition-colors duration-200 cursor-pointer"
              >
                Close
              </button>
              {actionButton && (
                <button
                  onClick={() => {
                    actionButton.onClick();
                    onClose();
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                >
                  {actionButton.text}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationPopup; 