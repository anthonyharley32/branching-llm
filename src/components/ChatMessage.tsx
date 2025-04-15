import React, { useState, useRef, useEffect } from 'react';
import { MessageNode } from '../types/conversation';
import { useConversation, AddMessageResult } from '../context/ConversationContext';
import { FiGitBranch } from 'react-icons/fi'; // Import branch icon
// TODO: Import store hook when needed for branch creation
// import { useChatStore } from '../store/useChatStore';

interface ChatMessageProps {
  message: MessageNode;
  onBranchCreated: (result: AddMessageResult, sourceText: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onBranchCreated }) => {
  const isUser = message.role === 'user';
  const [selectedText, setSelectedText] = useState<string>('');
  const messageContentRef = useRef<HTMLDivElement>(null);
  const { createBranch, hasChildren } = useConversation();

  // Specific classes for user messages (Grok style)
  const userBubbleClasses = 'bg-gray-100 text-gray-800 px-4 py-2 rounded-lg max-w-xs md:max-w-md lg:max-w-lg break-words self-end';

  // Minimal classes for AI messages (plain text with adjusted leading)
  const aiTextClasses = 'text-gray-800 px-4 py-2 max-w-prose break-words self-start leading-relaxed relative'; // Added relative positioning possibility

  // --- Check if this message is a branch point --- 
  const isBranchPoint = !isUser && hasChildren(message.id);

  // Handle text selection within this specific message
  const handleSelection = () => {
    if (isUser || !messageContentRef.current) {
      // If selection change happened but it's not relevant, ensure state is clear
      // Check existing state to avoid unnecessary re-renders
      if (selectedText) setSelectedText('');
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      // Ensure the selection is actually within the bounds of our message content div
      if (messageContentRef.current.contains(range.commonAncestorContainer)) {
        const text = selection.toString().trim();
        // Update state only if the selected text actually changed
        if (text && text !== selectedText) {
          setSelectedText(text);
          // console.log(`Selected in ${message.id}: "${text}"`); // Debug logging
          return; // Found valid selection, exit
        } else if (!text && selectedText) {
          // Selection cleared or now empty within this component
          setSelectedText('');
          return;
        }
      }
    }

    // If the selection check falls through (e.g., selection outside this div), clear state if needed
    if (selectedText) {
       // This case handles clicking outside or selecting elsewhere after selecting here
       // Check if the current selection is *still* within this component before clearing
       const currentSelection = window.getSelection();
       let selectionStillInComponent = false;
       if (currentSelection && currentSelection.rangeCount > 0) {
         const currentRange = currentSelection.getRangeAt(0);
         if (messageContentRef.current.contains(currentRange.commonAncestorContainer) && currentSelection.toString().trim()) {
           selectionStillInComponent = true;
         }
       }
       if (!selectionStillInComponent) {
         setSelectedText('');
       }
    }
  };

  // Use mouseup on the document to capture selection end events
  useEffect(() => {
    // Only add listener logic for AI messages
    if (isUser) {
        // Clear selection if user message becomes active or component re-renders as user
        if (selectedText) setSelectedText('');
        return; // Don't attach listener for user messages
    }

    // Define the listener function
    const checkSelection = () => {
        // Use requestAnimationFrame to ensure selection is finalized after mouseup
        requestAnimationFrame(() => {
             handleSelection();
        });
    };

    document.addEventListener('mouseup', checkSelection);

    // Cleanup function to remove the listener
    return () => {
      document.removeEventListener('mouseup', checkSelection);
    };
    // Depend on isUser and selectedText to potentially re-attach/cleanup or use inside handler
  }, [isUser, selectedText]); // Re-evaluate if component type changes or selectedText state changes


  const handleBranchClick = () => {
    if (!selectedText || isUser || !message.id) return;
    const currentSelectedText = selectedText; // Capture before clearing
    console.log(`Attempting to branch from message ${message.id} with text: "${currentSelectedText}"`);
    
    const branchResult = createBranch(message.id, currentSelectedText);
    
    if (branchResult) {
        console.log(`Branch initiated, new node ID: ${branchResult.newNode.id}`);
        // Call the callback prop with the result and the source text
        onBranchCreated(branchResult, currentSelectedText); 
    } else {
        console.error('Branch creation failed in component.');
    }
    
    setSelectedText(''); // Clear selection state
    window.getSelection()?.removeAllRanges(); // Clear visual selection
  };


  return (
    <div className={`flex w-full mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Wrap message content and button in a div for better structure if needed, especially for positioning */}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          ref={messageContentRef}
          className={`${isUser ? userBubbleClasses : aiTextClasses} ${isBranchPoint ? 'relative pr-6' : ''}`}
          // onMouseUp={handleSelection} // Handled by global listener now
        >
          {/* Render message content */}
          {message.content}
          {/* Render Branch Point Indicator Icon */} 
          {isBranchPoint && (
            <FiGitBranch 
              className="absolute bottom-1 right-1 text-gray-400 dark:text-gray-500 h-3 w-3" 
              title="This message has branches"
            />
          )}
        </div>
        {/* Render Branch button conditionally below the AI message */}
        {!isUser && selectedText && (
         <div className="flex justify-start w-full pl-4"> {/* Aligns button slightly indented */}
           <button
             onClick={handleBranchClick}
             className="-mt-1 px-2 py-0.5 bg-indigo-500 text-white text-xs rounded shadow hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-colors"
           >
             Branch from selection
           </button>
         </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage; 