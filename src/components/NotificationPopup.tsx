import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiInfo } from 'react-icons/fi';

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
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0, 
      transition: { 
        type: "spring", 
        stiffness: 300, 
        damping: 30 
      } 
    },
    exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } },
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
            className="bg-white dark:bg-gray-800 rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-gray-100 dark:border-gray-700 p-6 w-full max-w-md relative text-gray-900 dark:text-gray-100"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e: React.MouseEvent) => e.stopPropagation()} // Prevent closing when clicking modal content
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer hover:cursor-pointer"
              aria-label="Close notification"
            >
              <FiX size={20} />
            </button>

            {/* Icon and Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <FiInfo className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                {title}
              </h2>
            </div>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              {message}
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Close
              </button>
              {actionButton && (
                <button
                  onClick={() => {
                    actionButton.onClick();
                    onClose();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
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