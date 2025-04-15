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
  onBranchCreated: (result: AddMessageResult, sourceText: string, isNewBranch: boolean) => void;
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
  const [selectionPosition, setSelectionPosition] = useState<{ 
    top: number; 
    right: number;
    selectionStart?: number;
    selectionEnd?: number;
  } | null>(null);
  const { createBranch, hasChildren, conversation } = useConversation();

  // Helper function to get all text nodes inside an element
  const getAllTextNodes = (element: Node): Text[] => {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element, 
      NodeFilter.SHOW_TEXT, 
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }
    return textNodes;
  };

  // Helper to find a DOM node containing the text
  const findNodeWithText = (container: HTMLElement, searchText: string): {node: Text, offset: number} | null => {
    if (!searchText) return null;
    
    const allTextNodes = getAllTextNodes(container);
    // Try to find an exact match first
    for (const node of allTextNodes) {
      if (node.textContent && node.textContent.includes(searchText)) {
        return {
          node,
          offset: node.textContent.indexOf(searchText)
        };
      }
    }
    
    // If no exact match, try a fuzzy match with the beginning portion
    const searchStart = searchText.substring(0, Math.min(40, searchText.length)).trim();
    for (const node of allTextNodes) {
      if (node.textContent && node.textContent.includes(searchStart)) {
        return {
          node,
          offset: node.textContent.indexOf(searchStart)
        };
      }
    }
    
    return null;
  };

  // Specific classes for user messages (Grok style)
  const userBubbleClasses = 'bg-gray-100 text-gray-800 px-4 py-2 rounded-lg max-w-xs md:max-w-md lg:max-w-lg break-words self-end';

  // Minimal classes for AI messages (plain text with adjusted leading)
  const aiTextClasses = 'text-gray-800 px-4 py-2 max-w-prose break-words self-start leading-relaxed relative'; // Added relative positioning possibility

  // --- Check if this message is a branch point --- 
  const isBranchPoint = !isUser && hasChildren(message.id);

  // Updated branchSources state type to include metadata
  const [branchSources, setBranchSources] = useState<{
    text: string, 
    childId: string,
    metadata?: Record<string, any>
  }[]>([]);
  
  // Find branch sources when message loads or changes
  useEffect(() => {
    let sources: { text: string; childId: string; metadata?: Record<string, any>; }[] = []; // Default to empty

    if (!isUser && isBranchPoint && conversation?.messages) {
      // Find all children of this message
      const childNodes = Object.values(conversation.messages)
        .filter(msg => msg.parentId === message.id);
      
      // *** Add Logging Here ***
      console.log(`[Effect ${message.id}] Checking children:`, childNodes.map(c => ({id: c.id, role: c.role, meta: c.metadata})));

      // Filter children to find those created via text selection (metadata check)
      // Reassign sources if conditions met and valid sources found
      sources = childNodes
        .map(child => ({ 
          text: child.metadata?.selectedText || '', 
          childId: child.id,
          metadata: child.metadata // Store full metadata
        }))
        .filter(source => {
          // *** Add Logging Here ***
          const hasText = source.text.trim().length > 0;
          console.log(`[Effect ${message.id}] Filtering child ${source.childId}: hasSelectedText=${hasText}, text="${source.text}"`);
          return hasText;
        }); // Only include if selectedText exists
        
        // *** Add Logging Here ***
        console.log(`[Effect ${message.id}] Calculated sources:`, sources);
    }
    
    // Unconditionally set the state based on the calculated sources for this specific message
    // This ensures it's cleared if the if condition was false or if sources calculated to []
    setBranchSources(sources);

    // Dependencies: Run when message, context, or children status change
  }, [isUser, isBranchPoint, message.id, conversation?.messages]); // Removed branchSources.length dependency

  // After render, position branch indicators based on actual DOM positions
  useEffect(() => {
    if (isBranchPoint && messageContentRef.current && branchSources.length > 0) {
      // Small delay to ensure markdown has fully rendered
      const timer = setTimeout(() => {
        branchSources.forEach((source, index) => {
          const indicator = document.getElementById(`branch-indicator-${message.id}-${index}`);
          if (!indicator) return;
          
          // Find the text node containing the selected text
          const result = findNodeWithText(messageContentRef.current!, source.text);
          
          if (result) {
            try {
              // Create a range to get the bounding rectangle of the text
              const range = document.createRange();
              range.setStart(result.node, result.offset);
              range.setEnd(result.node, result.offset + Math.min(source.text.length, result.node.textContent!.length - result.offset));
              
              const rect = range.getBoundingClientRect();
              const messageRect = messageContentRef.current!.getBoundingClientRect();
              
              // Position the indicator at the right side, aligned with text start
              indicator.style.top = `${rect.top - messageRect.top}px`;
              console.log(`Positioned branch indicator for "${source.text.substring(0, 20)}..." at ${rect.top - messageRect.top}px`);
            } catch (e) {
              console.error('Error positioning branch indicator:', e);
            }
          } else {
            console.log(`Could not find text node for: "${source.text.substring(0, 20)}..."`);
          }
        });
      }, 100); // Small delay to ensure rendering is complete
      
      return () => clearTimeout(timer);
    }
  }, [isBranchPoint, branchSources, message.content, message.id]);

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
            right: maxRightPosition, // Position at the right edge with safety margin
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
    
    // Create branch with metadata including selection offsets
    const branchResult = createBranch(
      message.id, 
      currentSelectedText, 
      selectionPosition?.selectionStart, 
      selectionPosition?.selectionEnd
    );
    
    if (branchResult) {
        console.log(`Branch initiated, new node ID: ${branchResult.newNode.id}`);
        // Call the callback prop with the result and the source text
        onBranchCreated(branchResult, currentSelectedText, true);
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
           
           {/* Branch indicators for text that has been branched from */}
           {branchSources.length > 0 && branchSources.map((source, index) => (
             <div 
               key={`branch-${index}`}
               id={`branch-indicator-${message.id}-${index}`}
               style={{
                 position: 'absolute',
                 right: '0px',
                 top: '0px', // Initial position, will be updated by useEffect
                 cursor: 'pointer'
               }}
               onClick={() => {
                 // In-line simplified path finding to avoid external dependency
                 let messagePath: MessageNode[] = [];
                 let branchNode: MessageNode | null = null;
                 
                 if (conversation?.messages && source.childId) {
                   // Get the actual branch node with its content
                   branchNode = conversation.messages[source.childId];
                   
                   // Walk up parent links to build path
                   let currentId: string | null = source.childId;
                   const tempPath: MessageNode[] = [];
                   
                   while (currentId && conversation.messages[currentId]) {
                     tempPath.push(conversation.messages[currentId]);
                     currentId = conversation.messages[currentId].parentId;
                   }
                   
                   // Reverse to get root-to-target order
                   messagePath = tempPath.reverse();
                 }
                 
                 if (!branchNode) {
                   console.error("Failed to find branch node", source.childId);
                   return;
                 }
                 
                 // Make sure we pass the complete branch node with its content
                 const result = {
                   newNode: branchNode,
                   messagePath
                 } as AddMessageResult;
                 
                 console.log(`Entering existing branch with content: "${branchNode.content.substring(0, 30)}..."`);
                 onBranchCreated(result, source.text, false);
               }}
               className="group flex items-center justify-center p-1 transition-transform duration-150 ease-in-out hover:scale-130"
               title="View branch created from this text"
             >
               <div 
                 className="w-3.5 h-3.5 border border-gray-400 dark:border-gray-500 rounded-full 
                            transition-colors duration-150 ease-in-out 
                            group-hover:bg-gray-500 group-hover:border-gray-500"
               >
                 {/* Empty div serves as the circle */}
               </div>
             </div>
           ))}
           
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