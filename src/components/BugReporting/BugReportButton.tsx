import React, { useState } from 'react';
import BugReportForm from './BugReportForm';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

interface BugReportButtonProps {
  className?: string;
  buttonText?: string;
  showIcon?: boolean;
}

const BugReportButton: React.FC<BugReportButtonProps> = ({
  className = '',
  buttonText = 'Report Bug',
  showIcon = true
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  // --- Animation Variants --- 
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
  // ------------------------

  return (
    <>
      <button
        onClick={openModal}
        className={`flex items-center gap-1 py-2 px-3 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 rounded-md transition-colors ${className}`}
        aria-label="Report a bug"
      >
        {showIcon && <FiAlertTriangle className="inline-block text-gray-500 dark:text-gray-400" />}
        {buttonText}
      </button>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-500/10 backdrop-blur-sm"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={closeModal}
          >
            <motion.div
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] border border-gray-100 dark:border-gray-700 relative"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 z-10 cursor-pointer"
                aria-label="Close"
              >
                <FiX size={24} />
              </button>
              <BugReportForm onSuccess={closeModal} onCancel={closeModal} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BugReportButton; 