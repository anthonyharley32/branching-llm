import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import { FiEdit, FiCopy } from 'react-icons/fi';
import { MessageNode } from '../types/conversation';
import { useConversation, AddMessageResult } from '../context/ConversationContext';

interface ChatMessageProps {
  message: MessageNode;
  /** ID of assistant message currently streaming (to highlight/animate). */
  streamingNodeId?: string | null;
  onBranchCreated: (result: AddMessageResult, sourceText: string, isNewBranch: boolean) => void;
  onMessageEdited?: (messageId: string) => void;
}

// Custom function to pre-process KaTeX format to ensure proper rendering
const preprocessMarkdown = (content: string): string => {
  // Ensure display math is on its own lines
  return content
    // Fix display math not properly isolated on its own lines
    .replace(/([^\n])(\$\$)/g, '$1\n\n$$')
    .replace(/(\$\$)([^\n])/g, '$$\n\n$2');
};

// The main component function
const ChatMessageInternal: React.FC<ChatMessageProps> = ({ message, streamingNodeId, onBranchCreated, onMessageEdited }) => {
  // Determine if this is a user message
  const isUser = message.role === 'user';
  
  // --- DEBUGGING: Log raw AI message content ONCE per message ---
  useEffect(() => {
    if (!isUser) {
      // console.log(`Raw AI Message Content (ID: ${message.id}):`, message.content);
    }
  }, [isUser, message.content, message.id]); // Log only when content/id/role changes
  // --- END DEBUGGING ---

  // Add editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isHovering, setIsHovering] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [selectedText, setSelectedText] = useState<string>('');
  const messageContentRef = useRef<HTMLDivElement>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ 
    top: number; 
    right: number;
    selectionStart?: number;
    selectionEnd?: number;
  } | null>(null);
  const { createBranch, hasChildren, conversation, editMessage } = useConversation();

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
      
      // Filter children to find those created via text selection (metadata check)
      // Reassign sources if conditions met and valid sources found
      sources = childNodes
        .map(child => ({ 
          text: child.metadata?.selectedText || '', 
          childId: child.id,
          metadata: child.metadata // Store full metadata
        }))
        .filter(source => {
          const hasText = source.text.trim().length > 0;
          return hasText;
        }); // Only include if selectedText exists
        
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
          
          // Calculate position relative to the message container
          // Use the actual right edge of the text selection
          const rightPositionRelative = rect.right - messageRect.left;
          
          // Add a small offset for spacing between text and button
          const buttonOffset = 8; // pixels
          
          setSelectionPosition({
            top: rect.top + (rect.height / 2) - messageRect.top + window.scrollY, // Center for all selections
            right: rightPositionRelative + buttonOffset, // Position just after the selected text
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
          
          // Check if we still have duplicated content
          const duplicateCheck: string[] = [];
          katexElements.forEach((el) => {
            const textContent = el.textContent?.trim() || '';
            if (textContent && duplicateCheck.includes(textContent)) {
              // console.log(`Potential duplicate KaTeX content found at element ${i}:`, textContent);
            } else if (textContent) {
              duplicateCheck.push(textContent);
            }
          });
        }
      }, 500); // Small delay to ensure render is complete
    }
  }, [isUser, message.content, message.id]);

  // Branch creation handler
  const handleBranchClick = () => {
    if (!selectedText || isUser || !message.id) return;
    const currentSelectedText = selectedText;
    
    // Create branch with metadata including selection offsets
    const branchResult = createBranch(message.id, currentSelectedText, selectionPosition?.selectionStart, selectionPosition?.selectionEnd);
    
    if (branchResult) {
      // Call the callback prop with the result and the source text
      onBranchCreated(branchResult, currentSelectedText, false); // false means don't auto-explain
    }
    
    // Clear selection
    setSelectedText('');
    setSelectionPosition(null);
  };
  
  // Explain button handler
  const handleExplainClick = () => {
    if (!selectedText || isUser || !message.id) return;
    const currentSelectedText = selectedText;
    
    // Create branch with metadata including selection offsets
    const branchResult = createBranch(message.id, currentSelectedText, selectionPosition?.selectionStart, selectionPosition?.selectionEnd);
    
    if (branchResult) {
      // Call the callback prop with the result and the source text
      onBranchCreated(branchResult, currentSelectedText, true); // true means auto-explain
    }
    
    // Clear selection
    setSelectedText('');
    setSelectionPosition(null);
  };

  // Handle entering edit mode
  const handleEditClick = () => {
    setIsEditing(true);
    setEditedContent(message.content);
    // Store current message width
    if (messageContentRef.current) {
      const width = messageContentRef.current.offsetWidth;
      // Set a small timeout to allow the textarea to render before resizing
      setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.style.width = `${width}px`;
          editInputRef.current.style.height = 'auto';
          editInputRef.current.style.height = `${editInputRef.current.scrollHeight}px`;
        }
      }, 0);
    }
  };

  // Handle saving edited message
  const handleSaveEdit = () => {
    if (editMessage) {
      editMessage(message.id, editedContent, (editedId) => {
        // Call the onMessageEdited prop if provided
        if (onMessageEdited) {
          onMessageEdited(editedId);
        }
      });
    }
    setIsEditing(false);
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(message.content);
  };

  // Handle keyboard shortcuts in the textarea
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    // Cancel on Escape
    else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Function to copy message content to clipboard
  const handleCopyClick = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => {
        // Optional: show a brief success notification
      })
      .catch((err) => {
        console.error('Failed to copy message: ', err);
      });
  };

  const isStreaming = !isUser && streamingNodeId === message.id;

  return (
    <div className={`flex w-full mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Wrap message content and button in a div for better structure if needed, especially for positioning */}
      <div 
        className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} ${isUser && isEditing ? 'w-full max-w-3xl' : ''}`}
        onMouseEnter={() => isUser && setIsHovering(true)}
        onMouseLeave={() => isUser && setIsHovering(false)}
      >
        {isUser && isEditing ? (
          // Edit mode as a standalone UI rather than inside the bubble
          <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <textarea
              ref={editInputRef}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="px-4 py-3 w-full border-none outline-none resize-none text-gray-900 text-[15px]"
              style={{ 
                minHeight: '60px',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
              autoFocus
              onFocus={(e) => {
                // Set cursor at end of text
                e.target.selectionStart = e.target.value.length;
              }}
              onInput={(e) => {
                // Automatically adjust height
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
            <div className="flex justify-end space-x-2 px-4 py-2 bg-white">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          // Regular message display
          <div
            ref={messageContentRef}
            className={`${isUser ? userBubbleClasses : aiTextClasses} ${isBranchPoint ? 'relative pr-6' : ''} ${isUser ? 'relative' : ''}`}
          >
            {/* Background wave for currently streaming assistant message */}
            {isStreaming && (
              <div
                className="streaming-wave absolute left-0 pointer-events-none select-none"
                style={{ top: '0.6rem', zIndex: -1 }}
              />
            )}

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

            {/* Display images if present in metadata */}
            {hasImages && messageImages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {messageImages.map((imageUrl, idx) => (
                  <div key={`img-${idx}`} className="relative">
                    <img 
                      src={imageUrl} 
                      alt={`Image ${idx+1}`} 
                      className="max-w-xs max-h-60 rounded-lg object-cover" 
                    />
                  </div>
                ))}
              </div>
            )}
            
            {/* Branch indicators for text that has been branched from */}
            {branchSources.length > 0 && branchSources.map((source, index) => (
              <div 
                key={`branch-${index}`}
                id={`branch-indicator-${message.id}-${source.childId}`}
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
                    // console.error("Failed to find branch node", source.childId);
                    return;
                  }
                  
                  // Make sure we pass the complete branch node with its content
                  const result = {
                    newNode: branchNode,
                    messagePath
                  } as AddMessageResult;
                  
                  // console.log(`Entering existing branch with content: "${branchNode.content.substring(0, 30)}..."`);
                  onBranchCreated(result, source.text, false);
                }}
                onMouseEnter={() => {
                  // Apply darker color on hover
                  if (messageContentRef.current) {
                    const highlight = messageContentRef.current.querySelector(`.branch-source-highlight[data-branch-index="${index}"]`);
                    if (highlight) {
                      const highlightColor = getComputedStyle(document.documentElement).getPropertyValue('--branch-highlight-color').trim() || '#f5f0a8';
                      (highlight as HTMLElement).style.backgroundColor = highlightColor;
                      (highlight as HTMLElement).style.filter = 'brightness(0.8)'; // Make significantly darker on hover
                    }
                  }
                }}
                onMouseLeave={() => {
                  // Restore original color when not hovering
                  if (messageContentRef.current) {
                    const highlight = messageContentRef.current.querySelector(`.branch-source-highlight[data-branch-index="${index}"]`);
                    if (highlight) {
                      const highlightColor = getComputedStyle(document.documentElement).getPropertyValue('--branch-highlight-color').trim() || '#f5f0a8';
                      (highlight as HTMLElement).style.backgroundColor = highlightColor;
                      (highlight as HTMLElement).style.filter = 'none'; // Remove brightness filter
                    }
                  }
                }}
                className="group flex items-center justify-center p-1 transition-transform duration-150 ease-in-out hover:scale-130"
                title="View branch created from this text"
              >
                <div 
                  className="w-3.5 h-3.5 border border-gray-400 rounded-full 
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
                  left: `${selectionPosition.right ?? 0}px`,
                  transform: 'translateY(-50%)',
                  zIndex: 50,
                  opacity: 1,
                  animation: 'fadeIn 0.2s'
                }}
                className="branch-button-container"
              >
                <div className="flex shadow rounded-xl overflow-hidden">
                  <button
                    onClick={handleBranchClick}
                    className="px-3 py-2 text-base font-semibold bg-black text-white rounded-l-xl hover:bg-gray-900 focus:outline-none transition-colors whitespace-nowrap cursor-pointer border-r border-gray-700"
                    title="Branch from selection"
                  >
                    Branch
                  </button>
                  <button
                    onClick={handleExplainClick}
                    className="px-3 py-2 text-base font-semibold bg-black text-white rounded-r-xl hover:bg-gray-900 focus:outline-none transition-colors whitespace-nowrap cursor-pointer"
                    title="Get explanation of selection"
                  >
                    Explain
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Message action buttons - as a normal element with fixed height */}
        <div className="h-8 flex items-center justify-center">
          {isUser && !isEditing && isHovering && (
            <div className="flex space-x-3">
              <button
                onClick={handleCopyClick}
                className="p-1.5 text-gray-500 hover:text-gray-800 rounded transition-colors"
                title="Copy message"
              >
                <FiCopy className="h-4 w-4" />
              </button>
              <button
                onClick={handleEditClick} 
                className="p-1.5 text-gray-500 hover:text-gray-800 rounded transition-colors"
                title="Edit message"
              >
                <FiEdit className="h-4 w-4" />
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