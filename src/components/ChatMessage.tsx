import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math'; // Import remark-math
import rehypeRaw from 'rehype-raw'; // Import rehype-raw
// import { FiGitBranch } from 'react-icons/fi'; // Removed unused import
import { MessageNode } from '../types/conversation';
import { useConversation, AddMessageResult } from '../context/ConversationContext';
import { IoMdCheckmark, IoMdClose, IoMdCreate } from 'react-icons/io';
// TODO: Import store hook when needed for branch creation
// import { useChatStore } from '../store/useChatStore';

interface ChatMessageProps {
  message: MessageNode;
  /** ID of assistant message currently streaming (to highlight/animate). */
  streamingNodeId?: string | null;
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

// Helper function to darken/lighten color
const shadeColor = (color: string, percent: number) => {
  let R = parseInt(color.substring(1,3), 16);
  let G = parseInt(color.substring(3,5), 16);
  let B = parseInt(color.substring(5,7), 16);

  R = Math.floor(R * (100 + percent) / 100);
  G = Math.floor(G * (100 + percent) / 100);
  B = Math.floor(B * (100 + percent) / 100);

  R = (R < 255) ? R : 255;  
  G = (G < 255) ? G : 255;  
  B = (B < 255) ? B : 255;  

  R = (R > 0) ? R : 0;  
  G = (G > 0) ? G : 0;  
  B = (B > 0) ? B : 0; 

  const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
  const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
  const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

  return "#" + RR + GG + BB;
};

// The main component function
const ChatMessageInternal: React.FC<ChatMessageProps> = ({ message, streamingNodeId, onBranchCreated }) => {
  // Determine if this is a user message
  const isUser = message.role === 'user';
  
  // --- DEBUGGING: Log raw AI message content ONCE per message ---
  useEffect(() => {
    if (!isUser) {
      // console.log(`Raw AI Message Content (ID: ${message.id}):`, message.content);
    }
  }, [isUser, message.content, message.id]); // Log only when content/id/role changes
  // --- END DEBUGGING ---

  const [selectedText, setSelectedText] = useState<string>('');
  const [showEditControls, setShowEditControls] = useState<boolean>(false);
  const [editedContent, setEditedContent] = useState<string>('');
  const messageContentRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ 
    top: number; 
    right: number;
    selectionStart?: number;
    selectionEnd?: number;
  } | null>(null);
  const { createBranch, hasChildren, conversation, startEditingMessage, saveEditedMessage, cancelEditingMessage, selectBranch } = useConversation();

  // Check if this message is being edited
  const isEditing = conversation?.editingMessageId === message.id;

  // Set up editing state when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditedContent(message.content);
      // Focus the textarea after a short delay to allow it to render
      setTimeout(() => {
        if (editTextareaRef.current) {
          editTextareaRef.current.focus();
          editTextareaRef.current.setSelectionRange(
            editTextareaRef.current.value.length,
            editTextareaRef.current.value.length
          );
        }
      }, 50);
    }
  }, [isEditing, message.content]);

  // Check if message has images in metadata
  const hasImages = message.metadata?.images && Array.isArray(message.metadata.images) && message.metadata.images.length > 0;
  const messageImages = hasImages ? message.metadata?.images as string[] : [];

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
  const userBubbleClasses = 'bg-white text-gray-900 px-3 rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-md max-w-xs md:max-w-md lg:max-w-lg break-words self-end border border-gray-200 shadow-sm transition-colors text-[15px]';

  // Minimal classes for AI messages (plain text with adjusted leading)
  // Keep relative positioning to allow absolutely positioned wave background
  const aiTextClasses = 'text-gray-800 px-4 py-2 max-w-prose break-words self-start leading-relaxed relative';

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
      // console.log(`[Effect ${message.id}] Checking children:`, childNodes.map(c => ({id: c.id, role: c.role, meta: c.metadata})));

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
          // console.log(`[Effect ${message.id}] Filtering child ${source.childId}: hasSelectedText=${hasText}, text="${source.text}"`);
          return hasText;
        }); // Only include if selectedText exists
        
        // *** Add Logging Here ***
        // console.log(`[Effect ${message.id}] Calculated sources:`, sources);
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
        // **Revised Sorting**: Sort sources based on their visual horizontal position
        const sortedSources = [...branchSources].sort((a, b) => {
          const resultA = findNodeWithText(messageContentRef.current!, a.text);
          const resultB = findNodeWithText(messageContentRef.current!, b.text);

          if (!resultA || !resultB) return 0; // Keep original relative order if text not found

          try {
            const rangeA = document.createRange();
            rangeA.setStart(resultA.node, resultA.offset);
            rangeA.setEnd(resultA.node, resultA.offset + Math.min(a.text.length, resultA.node.textContent!.length - resultA.offset));
            const rectA = rangeA.getBoundingClientRect();

            const rangeB = document.createRange();
            rangeB.setStart(resultB.node, resultB.offset);
            rangeB.setEnd(resultB.node, resultB.offset + Math.min(b.text.length, resultB.node.textContent!.length - resultB.offset));
            const rectB = rangeB.getBoundingClientRect();
            
            // Sort by the left edge position
            return rectA.left - rectB.left;
          } catch (e) {
            // console.error("Error getting bounding rects for sorting indicators:", e);
            return 0; // Fallback to original relative order on error
          }
        });

        // Now position indicators based on sorted sources
        sortedSources.forEach((source, sortedIndex) => {
          // Find indicator using stable ID derived from childId
          const indicator = document.getElementById(`branch-indicator-${message.id}-${source.childId}`);
          if (!indicator) {
            // console.warn(`Could not find indicator DOM element for source child ID: ${source.childId}`);
            return;
          }

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

              // Position the indicator vertically aligned with text start
              indicator.style.top = `${rect.top - messageRect.top}px`;
              
              // **Revised Offset Logic**: Apply horizontal offset based on sorted position
              const baseRightOffset = -10; // Closest to the right edge
              const additionalOffsetPerIndicator = -25; // Moves further left (Increased spacing)

              // Check how many *previous* indicators in the sorted list are on the same visual line
              const sameLineIndicatorsCount = sortedSources
                .slice(0, sortedIndex) // Use sortedIndex to check elements before this one in the sorted list
                .filter(prevSource => {
                  const prevResult = findNodeWithText(messageContentRef.current!, prevSource.text);
                  if (!prevResult) return false;
                  try {
                    const prevRange = document.createRange();
                    prevRange.setStart(prevResult.node, prevResult.offset);
                    prevRange.setEnd(prevResult.node, prevResult.offset + Math.min(prevSource.text.length, prevResult.node.textContent!.length - prevResult.offset));
                    const prevRect = prevRange.getBoundingClientRect();
                    // Consider them on the same line if vertical positions are very close
                    return Math.abs(prevRect.top - rect.top) < 5; 
                  } catch { return false; }
                }).length;

              // Calculate final right position
              indicator.style.right = `${baseRightOffset + (sameLineIndicatorsCount * additionalOffsetPerIndicator)}px`;

              // console.log(`Positioned indicator ${sortedIndex} for "${source.text.substring(0, 20)}..." at top: ${indicator.style.top}, right: ${indicator.style.right}`);
            } catch (e) {
              // console.error('Error positioning branch indicator:', e);
            }
          } else {
            // console.log(`Could not find text node for: "${source.text.substring(0, 20)}..."`);
          }
        });
      }, 100); // Small delay to ensure rendering is complete

      return () => clearTimeout(timer);
    }
  }, [isBranchPoint, branchSources, message.content, message.id]);

  // New effect: Apply yellow highlighting to branch source text
  useEffect(() => {
    if (isBranchPoint && messageContentRef.current && branchSources.length > 0) {
      // Small delay to ensure markdown has fully rendered
      const timer = setTimeout(() => {
        // Remove any existing highlights first (to prevent duplicates on re-render)
        const existingHighlights = messageContentRef.current!.querySelectorAll('.branch-source-highlight');
        existingHighlights.forEach(el => {
          // Unwrap the highlight (move its children to its parent, then remove it)
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) {
              parent.insertBefore(el.firstChild, el);
            }
            parent.removeChild(el);
          }
        });
        
        // Now add highlights for each branch source
        branchSources.forEach((source, index) => {
          const result = findNodeWithText(messageContentRef.current!, source.text);
          
          if (result) {
            try {
              // Create a range for the text to highlight
              const range = document.createRange();
              range.setStart(result.node, result.offset);
              range.setEnd(result.node, result.offset + Math.min(source.text.length, result.node.textContent!.length - result.offset));
              
              // Create a highlight span
              const highlightSpan = document.createElement('span');
              highlightSpan.className = 'branch-source-highlight';
              highlightSpan.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--branch-highlight-color').trim() || '#f5f0a8'; // Use CSS variable
              highlightSpan.dataset.branchIndex = index.toString(); // Store index for later hover effects
              
              // Surround the text with the highlight span
              range.surroundContents(highlightSpan);
              
              // console.log(`Added yellow highlight to: "${source.text.substring(0, 20)}..."`);
            } catch (e) {
              // console.error('Error highlighting branch source text:', e);
            }
          }
        });
      }, 150); // Slight delay to ensure DOM is ready
      
      return () => clearTimeout(timer);
    }
  }, [isBranchPoint, branchSources, message.content, message.id]);

  // Handle edit keyboard shortcuts
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl/Cmd + Enter to save
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      // Escape to cancel
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Check for user selection to enable branch/explain functionality
  const checkSelection = () => {
    if (isUser) return; // Don't run for user messages
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !messageContentRef.current) {
      // Clear selection UI if there's no valid selection
      setSelectedText('');
      setSelectionPosition(null);
      return;
    }
    
    // Get selected text
    const text = selection.toString().trim();
    
    // Only proceed if we have valid selected text
    if (text) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = messageContentRef.current.getBoundingClientRect();
      
      // Calculate relative position to message container
      setSelectionPosition({
        top: rect.top - containerRect.top + rect.height / 2,
        right: containerRect.right - rect.right + 10,
        selectionStart: range.startOffset,
        selectionEnd: range.endOffset
      });
      setSelectedText(text);
    } else {
      setSelectedText('');
      setSelectionPosition(null);
    }
  };

  // Handle branch button click
  const handleBranchClick = (childId?: string) => {
    if (childId) {
      // Navigate to existing branch
      const branchMessageId = childId;
      
      if (conversation?.messages && branchMessageId) {
        // Select the branch with the given messageId
        selectBranch(branchMessageId);
      }
    } else {
      // Create new branch from selection
      if (!selectedText) return;
      
      const result = createBranch(
        message.id, 
        selectedText,
        selectionPosition?.selectionStart,
        selectionPosition?.selectionEnd
      );
      
      if (result) {
        onBranchCreated(result, selectedText, true);
      }
      
      // Clear selection state after branching
      setSelectedText('');
      setSelectionPosition(null);
    }
  };

  // Handle explain click
  const handleExplainClick = () => {
    // Clear selection UI
    setSelectedText('');
    setSelectionPosition(null);
  };

  // Handle edit button click
  const handleEditClick = () => {
    startEditingMessage(message.id);
  };

  // Handle save edit button click
  const handleSaveEdit = async () => {
    await saveEditedMessage(message.id, editedContent);
  };

  // Handle cancel edit button click
  const handleCancelEdit = () => {
    cancelEditingMessage();
  };

  // Handle textarea input change
  const handleEditInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
  };

  const isStreaming = !isUser && streamingNodeId === message.id;

  return (
    <div 
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} relative group`}
      onMouseEnter={() => isUser && setShowEditControls(true)}
      onMouseLeave={() => isUser && setShowEditControls(false)}
    >
      {/* User-specific UI */}
      {isUser && (
        <>
          {/* Edit button that appears on hover */}
          {!isEditing && showEditControls && (
            <button 
              onClick={handleEditClick}
              className="absolute -top-3 -right-3 bg-white p-1 rounded-full text-gray-600 hover:text-gray-900 shadow-sm z-10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <IoMdCreate size={16} />
            </button>
          )}

          {/* User message content */}
          <div className={`${userBubbleClasses} relative ${isEditing ? 'hidden' : ''}`}>
            {messageImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {messageImages.map((img, idx) => (
                  <img 
                    key={idx} 
                    src={img} 
                    alt={`User uploaded ${idx}`} 
                    className="max-h-60 max-w-full rounded-md"
                  />
                ))}
              </div>
            )}
            <ReactMarkdown
              children={message.content}
              components={{
                code: ({ node, ...props }) => <code className="bg-gray-50 px-1 py-0.5 rounded text-red-500 font-mono text-sm" {...props} />
              }}
            />
          </div>
          
          {/* Edit mode UI */}
          {isEditing && (
            <div className="flex flex-col w-full max-w-xs md:max-w-md lg:max-w-lg">
              <textarea
                ref={editTextareaRef}
                value={editedContent}
                onChange={handleEditInputChange}
                onKeyDown={handleEditKeyDown}
                className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[100px] text-sm"
              />
              <div className="flex justify-end space-x-2 mt-2">
                <button
                  onClick={handleCancelEdit}
                  className="p-2 bg-gray-100 rounded-md text-gray-700 hover:bg-gray-200"
                >
                  <IoMdClose size={18} />
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="p-2 bg-blue-100 rounded-md text-blue-700 hover:bg-blue-200"
                >
                  <IoMdCheckmark size={18} />
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1 flex justify-end">
                Press Esc to cancel, ⌘+Enter to save
              </div>
            </div>
          )}
        </>
      )}

      {/* AI-specific UI (unchanged) */}
      {!isUser && (
        <div className="relative w-full">
          <div 
            ref={messageContentRef}
            className={aiTextClasses}
            onMouseUp={checkSelection}
          >
            {/* Branch indicators */}
            {isBranchPoint && branchSources.map((source, index) => (
              <div
                key={`${message.id}-${source.childId}`} 
                id={`branch-indicator-${message.id}-${source.childId}`}
                className="absolute right-0 w-3 h-3 bg-blue-500 rounded-full opacity-70 hover:opacity-100 cursor-pointer text-center text-white text-[8px] leading-3"
                style={{ top: '0px', transform: 'translateX(50%)' }}
                title="View branched response"
                onClick={() => handleBranchClick(source.childId)}
              ></div>
            ))}
            
            {/* AI message content */}
            <ReactMarkdown
              children={preprocessMarkdown(message.content)}
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
              components={{
                code: ({ node, inline, className, children, ...props }: any) => {
                  return inline ? (
                    <code className="bg-gray-50 px-1 py-0.5 rounded text-red-500 font-mono text-sm" {...props}>
                      {children}
                    </code>
                  ) : (
                    <div className="bg-gray-50 rounded-md my-2 overflow-hidden">
                      <div className="bg-gray-100 py-1 px-4 border-b border-gray-200 text-xs font-mono text-gray-500">
                        {className ? className.replace(/language-/, '') : 'code'}
                      </div>
                      <pre className="p-4 overflow-x-auto">
                        <code className="font-mono text-sm">{children}</code>
                      </pre>
                    </div>
                  );
                }
              }}
            />
            
            {/* Selection controls */}
            {selectionPosition && selectedText && (
              <div 
                className="absolute bg-white shadow-md rounded p-2 flex items-center space-x-2 z-10"
                style={{
                  top: `${selectionPosition.top - 40}px`,
                  right: `${-10}px`,
                }}
              >
                <button
                  onClick={handleExplainClick}
                  className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  Explain
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Wrap the component with React.memo for performance optimization
const ChatMessage = React.memo(ChatMessageInternal);

export default ChatMessage; 