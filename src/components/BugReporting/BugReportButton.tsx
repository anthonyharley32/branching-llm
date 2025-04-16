import React, { useState } from 'react';
import BugReportForm from './BugReportForm';
import { FiAlertTriangle } from 'react-icons/fi';

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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="relative">
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <BugReportForm onSuccess={closeModal} onCancel={closeModal} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BugReportButton; 