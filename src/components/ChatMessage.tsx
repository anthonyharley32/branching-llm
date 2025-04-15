import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math'; // Import remark-math
import rehypeRaw from 'rehype-raw'; // Import rehype-raw
import { FiGitBranch } from 'react-icons/fi'; // Import branch icon
import { MessageNode } from '../types/conversation';
import { useConversation, AddMessageResult } from '../context/ConversationContext';
// TODO: Import store hook when needed for branch creation
// import { useChatStore } from '../store/useChatStore';

interface ChatMessageProps {
  message: MessageNode;
  onBranchCreated: (result: AddMessageResult, sourceText: string) => void;
}

// Custom function to pre-process KaTeX format to ensure proper rendering
const preprocessMarkdown = (content: string): string => {
  // Ensure display math is on its own lines
  return content
    // Fix display math not properly isolated on its own lines
    .replace(/([^\n])(\$\$)/g, '$1\n\n$$')
    .replace(/(\$\$)([^\n])/g, '$$\n\n$2');
};

const ChatMessageInternal: React.FC<ChatMessageProps> = ({ message, onBranchCreated }) => {
  const isUser = message.role === 'user';

  // --- DEBUGGING: Log raw AI message content ONCE per message ---
  useEffect(() => {
    if (!isUser) {
      console.log(`Raw AI Message Content (ID: ${message.id}):`, message.content);
    }
  }, [isUser, message.content, message.id]); // Log only when content/id/role changes
  // --- END DEBUGGING ---

  const [selectedText, setSelectedText] = useState<string>('');
  const messageContentRef = useRef<HTMLDivElement>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; right: number } | null>(null);
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
      if (selectionPosition) setSelectionPosition(null);
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
          // Calculate position for the button
          const rect = range.getBoundingClientRect();
          const messageRect = messageContentRef.current.getBoundingClientRect();
          
          // Calculate the right position with a safety margin to prevent cutoff
          // Constrain the position to ensure the button stays within viewport
          const viewportWidth = window.innerWidth;
          const maxRightPosition = Math.min(
            messageRect.width,  // Right edge of message
            viewportWidth - messageRect.left - 100 // Safety margin from viewport edge
          );
          
          // Position at the right side of the message container
          // Always vertically center with the text line
          setSelectionPosition({
            top: rect.top + (rect.height / 2) - messageRect.top + window.scrollY, // Center for all selections
            right: maxRightPosition // Position at the right edge with safety margin
          });
          return; // Found valid selection, exit
        } else if (!text && selectedText) {
          // Selection cleared or now empty within this component
          setSelectedText('');
          setSelectionPosition(null);
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
         setSelectionPosition(null);
       }
    }
  };

  // Use mouseup on the document to capture selection end events
  useEffect(() => {
    // Only add listener logic for AI messages
    if (isUser) {
        // Clear selection if user message becomes active or component re-renders as user
        if (selectedText) setSelectedText('');
        if (selectionPosition) setSelectionPosition(null);
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

  // Debug KaTeX HTML structure after render
  useEffect(() => {
    if (!isUser && messageContentRef.current) {
      setTimeout(() => {
        const katexElements = messageContentRef.current?.querySelectorAll('.katex');
        if (katexElements?.length) {
          console.log(`Found ${katexElements.length} KaTeX elements`);
          
          // Log structure of first katex element to see what's happening
          const firstKatex = katexElements[0];
          const htmlEl = firstKatex.querySelector('.katex-html');
          const mathmlEl = firstKatex.querySelector('.katex-mathml');
          
          console.log('KaTeX structure:', {
            htmlHidden: htmlEl?.hasAttribute('aria-hidden') || false,
            mathmlVisible: mathmlEl !== null,
            html: htmlEl?.innerHTML || 'not found',
            mathml: mathmlEl?.innerHTML || 'not found'
          });
          
          // Check if we still have duplicated content
          const duplicateCheck: string[] = [];
          katexElements.forEach((el, i) => {
            const textContent = el.textContent?.trim() || '';
            if (textContent && duplicateCheck.includes(textContent)) {
              console.log(`Potential duplicate KaTeX content found at element ${i}:`, textContent);
            } else if (textContent) {
              duplicateCheck.push(textContent);
            }
          });
        }
      }, 500); // Small delay to ensure render is complete
    }
  }, [isUser, message.content, message.id]);

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
    setSelectionPosition(null); // Clear position
    window.getSelection()?.removeAllRanges(); // Clear visual selection
  };


  return (
    <div className={`flex w-full mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Wrap message content and button in a div for better structure if needed, especially for positioning */}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          ref={messageContentRef}
          className={`${isUser ? userBubbleClasses : aiTextClasses} ${isBranchPoint ? 'relative pr-6' : ''}`}
        >
           {/* Render message content using react-markdown */}
             <ReactMarkdown
               remarkPlugins={[remarkMath, remarkGfm]}
               rehypePlugins={[
                 rehypeRaw, 
                 [rehypeKatex, { 
                   throwOnError: false,
                   output: 'mathml',
                   trust: true,  
                   strict: false,
                   displayMode: false,
                   maxSize: 100,
                   maxExpand: 1000
                 }]
               ]}
               components={{
                 // Custom heading renderers with more specific styling
                 h1: ({children}) => <h1 className="text-4xl font-bold my-6 border-b border-gray-300 pb-2">{children}</h1>,
                 h2: ({children}) => <h2 className="text-2xl font-bold my-4">{children}</h2>,
                 h3: ({children}) => <h3 className="text-xl font-bold my-3">{children}</h3>,
                 // Style horizontal rules to be gray
                 hr: () => <hr className="border-gray-300 my-4" />,
                 // Style line breaks to be visible as gray lines
                 br: () => <span className="inline-block w-full h-px bg-gray-200 my-1"></span>
               }}
             >
               {preprocessMarkdown(message.content)}
             </ReactMarkdown>
           {/* Render Branch Point Indicator Icon */}
           {isBranchPoint && (
             <FiGitBranch 
               className="absolute bottom-1 right-1 text-gray-400 dark:text-gray-500 h-3 w-3" 
               title="This message has branches"
             />
           )}
           
           {/* Floating branch button that appears next to selection */}
           {!isUser && selectedText && selectionPosition && (
             <div 
               style={{
                 position: 'absolute',
                 top: `${selectionPosition.top}px`,
                 left: `${selectionPosition.right}px`,
                 transform: 'translateY(-50%)', // Center vertically relative to position
                 zIndex: 50 // Higher z-index to ensure visibility
               }}
               className="branch-button-container"
             >
               <button
                 onClick={handleBranchClick}
                 className="px-2 py-0.5 bg-indigo-500 text-white text-xs rounded shadow hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-colors whitespace-nowrap"
                 title="Branch from selection"
               >
                 Branch
               </button>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

// Wrap the component with React.memo for performance optimization
const ChatMessage = React.memo(ChatMessageInternal);

export default ChatMessage; 