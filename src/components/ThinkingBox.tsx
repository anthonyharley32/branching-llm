import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown, FiChevronsUp, FiCpu } from 'react-icons/fi'; // Brain or CPU icon
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ThinkingBoxProps {
  thinkingContent: string;
  isThinkingComplete: boolean;
}

const ThinkingBox: React.FC<ThinkingBoxProps> = ({ thinkingContent, isThinkingComplete }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [hasContent, setHasContent] = useState<boolean>(false);

  // Automatically collapse when thinking is complete, but only if there was content
  useEffect(() => {
    if (isThinkingComplete && hasContent) {
      setIsExpanded(false);
    }
  }, [isThinkingComplete, hasContent]);

  // Track if any content has been received
  useEffect(() => {
    if (thinkingContent && thinkingContent.trim().length > 0) {
      setHasContent(true);
    }
  }, [thinkingContent]);

  // Don't render anything if thinking is complete AND no content was ever received
  if (isThinkingComplete && !hasContent) {
    return null;
  }

  const toggleExpand = () => {
    // Only allow expanding/collapsing if thinking is complete or if there's content
    if (isThinkingComplete || hasContent) {
      setIsExpanded(!isExpanded);
    }
  };

  // Animation variants
  const boxVariants = {
    initial: { height: 0, opacity: 0, marginTop: 0, marginBottom: 0 },
    expanded: { 
      height: 'auto', 
      opacity: 1, 
      marginTop: '0.5rem', 
      marginBottom: '0.5rem',
      transition: { duration: 0.3, ease: 'easeInOut' } 
    },
    collapsed: { 
      height: '2.5rem', // Height of the collapsed bar
      opacity: 1, 
      marginTop: '0.5rem', 
      marginBottom: '0.5rem',
      transition: { duration: 0.3, ease: 'easeInOut' } 
    },
    exit: { 
        height: 0, 
        opacity: 0, 
        marginTop: 0, 
        marginBottom: 0, 
        transition: { duration: 0.2 } 
    },
  };

  const contentVariants = {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { delay: 0.2 } },
      exit: { opacity: 0, transition: { duration: 0.1 } }
  };

  return (
    <AnimatePresence>
      {(hasContent || !isThinkingComplete) && ( // Only render if there's content or thinking is ongoing
        <motion.div
          key="thinking-box"
          variants={boxVariants}
          initial="initial"
          animate={isExpanded ? 'expanded' : 'collapsed'}
          exit="exit"
          className="bg-gray-100 border border-gray-200 rounded-lg overflow-hidden shadow-sm mx-4 my-2 max-w-prose self-start relative"
          style={{ willChange: 'height, opacity' }} // Optimize animation performance
        >
          {/* Collapsed View / Header */}
          <div 
            className={`flex items-center justify-between p-2 h-10 cursor-pointer ${!isThinkingComplete ? 'cursor-default' : ''}`}
            onClick={toggleExpand}
          >
            <div className="flex items-center space-x-2">
              <FiCpu className="h-5 w-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                {isThinkingComplete ? 'Thinking Process' : 'Thinking...'}
              </span>
            </div>
            {/* Show toggle button only when complete and content exists */}
            {isThinkingComplete && hasContent && (
                <button
                  className="p-1 rounded-full hover:bg-gray-200 text-gray-500"
                  aria-label={isExpanded ? 'Collapse Thinking' : 'Expand Thinking'}
                >
                  {isExpanded ? <FiChevronsUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
                </button>
            )}
          </div>

          {/* Expanded Content Area */}
          {isExpanded && (
            <motion.div
              key="thinking-content"
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="p-3 pt-0 border-t border-gray-200"
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  // Use a div wrapper for the content and apply the className there
                  // Passing children directly to the div to render the markdown content
                  div: ({node, children, ...props}) => <div className="prose prose-sm max-w-none text-gray-700 thinking-content" {...props}>{children}</div>
                }}
              >
                {thinkingContent || (!isThinkingComplete ? '*Waiting for thoughts...*' : '*No thinking process recorded.*')}
              </ReactMarkdown>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ThinkingBox; 