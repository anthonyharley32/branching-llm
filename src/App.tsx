import React, { useEffect, useState, useRef } from 'react'
import './App.css'
// import ChatMessage from './components/ChatMessage' // Removed unused import
import ChatInput from './components/ChatInput'
import ChatThread from './components/ChatThread'
import { ConversationProvider, useConversation, AddMessageResult } from './context/ConversationContext'
import { AuthProvider, useAuth } from './context/AuthContext'
// import AuthContainer from './components/auth/AuthContainer' // Already removed
import { 
  generateCompletionStream,
  generateTitle,
  LLMError, 
  ErrorType, 
  StreamCallbacks
} from './services/llm'
import { MessageNode } from './types/conversation'
import { FiLogOut, FiArrowLeft, FiUser, FiMenu, FiPlusSquare, FiEdit } from 'react-icons/fi' // Added FiEdit
// import { supabase } from './lib/supabase' // Already removed
import { motion, AnimatePresence } from 'framer-motion'
import type { Conversation } from './types/conversation'
import { BugReportButton } from './components/BugReporting'
import AuthModal from './components/auth/AuthModal'
import ProfileModal from './components/profile/ProfileModal'
import ChatHistory from './components/ChatHistory'
import { supabase } from './lib/supabase' // Added supabase import
import { UserProfile } from './types/database' // Added UserProfile type import

// --- Constants ---
const GUEST_MESSAGE_LIMIT = 1000;
const GUEST_MESSAGE_COUNT_KEY = 'LearningLLM_guest_message_count';

// Helper to get the main thread path (root to latest non-branch message)
function getMainThreadPath(conversation: Conversation | null): MessageNode[] {
  if (!conversation?.messages || !conversation.rootMessageId) return [];
  const messages = conversation.messages;
  let path: MessageNode[] = [];
  let currentId: string | null = conversation.rootMessageId;
  let current: MessageNode | undefined = messages[currentId];
  while (current) {
    path.push(current);
    // Find the next child that is NOT a branch (no isBranchStart in metadata)
    const children = Object.values(messages).filter((m: MessageNode) => m.parentId === current!.id && !(m.metadata && m.metadata.isBranchStart));
    if (children.length === 0) break;
    // If multiple, pick the earliest createdAt
    children.sort((a: MessageNode, b: MessageNode) => a.createdAt.getTime() - b.createdAt.getTime());
    current = children[0];
    currentId = current.id;
  }
  return path;
}

function AppContent() {
  const { user, isLoading: isAuthLoading, session, signOut } = useAuth();
  const { 
    conversation,
    startNewConversation, 
    addMessage,
    updateMessageContent,
    updateConversationTitle,
    currentMessages,
    activeMessageId,
    setActiveMessageId,
  } = useConversation();

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<LLMError | null>(null)
  const [guestMessageCount, setGuestMessageCount] = useState<number>(0); // State for guest count
  
  // Replace single branchParentId with a branch navigation stack
  const [branchStack, setBranchStack] = useState<{
    parentId: string;
    branchId: string | null;
    sourceText: string | null;
  }[]>([]);
  
  // Computed properties based on the branch stack
  const branchParentId = branchStack.length > 0 ? branchStack[branchStack.length - 1].parentId : null;
  const branchId = branchStack.length > 0 ? branchStack[branchStack.length - 1].branchId : null;
  const branchSourceText = branchStack.length > 0 ? branchStack[branchStack.length - 1].sourceText : null;
  
  const [streamingAiNodeId, setStreamingAiNodeId] = useState<string | null>(null); // Track the ID of the AI message being streamed

  // State to trigger LLM call after user message is added
  const [pendingLlmCall, setPendingLlmCall] = useState<{
    parentId: string; 
    path: MessageNode[];
    metadata?: Record<string, any>;
  } | null>(null);

  const [showingMainThread, setShowingMainThread] = useState(false);

  // --- State for Auth Modal --- 
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);
  
  // Profile modal state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const openProfileModal = () => setIsProfileModalOpen(true);
  const closeProfileModal = () => setIsProfileModalOpen(false);
  // Profile dropdown state
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null); // Ref for the profile button
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref for the dropdown
  // Chat history sidebar state
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  // State for user's additional system prompt
  const [additionalSystemPrompt, setAdditionalSystemPrompt] = useState<string | null>(null);

  // --- Click outside handler for profile dropdown ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileButtonRef.current &&
        !profileButtonRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    }

    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileDropdownOpen]);
  // ---------------------------------------------

  // Open history sidebar for logged-in users on page load
  useEffect(() => {
    if (session && !isAuthLoading) {
      setIsHistoryOpen(true);
    }
  }, [session, isAuthLoading]);

  // Load guest message count from localStorage on initial load if not logged in
  useEffect(() => {
    if (!isAuthLoading && !session) {
      try {
        const storedCount = localStorage.getItem(GUEST_MESSAGE_COUNT_KEY);
        const count = storedCount ? parseInt(storedCount, 10) : 0;
        if (!isNaN(count)) {
            setGuestMessageCount(count);
        } else {
            localStorage.removeItem(GUEST_MESSAGE_COUNT_KEY);
            setGuestMessageCount(0);
        }
      } catch (err) {
        setGuestMessageCount(0); // Default to 0 on error
      }
    }
  }, [isAuthLoading, session]); // Run when auth state is determined

  // Callback function to update the prompt state in AppContent
  const handleProfileUpdate = (newPrompt: string | null) => {
    setAdditionalSystemPrompt(newPrompt);
  };

  // Effect to fetch user profile and additional system prompt
  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('additional_system_prompt')
            .eq('user_id', user.id)
            .single();
            
          if (error && error.code !== 'PGRST116') { // Ignore 'No rows found' error
            console.error('Error fetching user profile prompt:', error);
          } else if (data) {
            setAdditionalSystemPrompt(data.additional_system_prompt || null);
          }
        } catch (err) {
          console.error('Exception fetching user profile prompt:', err);
        }
      }
    };
    fetchProfile();
  }, [user]); // Re-run when user changes

  // --- Effect to initiate LLM stream after user message state is updated ---
  useEffect(() => {
    if (!pendingLlmCall) return;

    const { parentId: aiParentId, path: messagePath, metadata } = pendingLlmCall;
    let tempAiNodeId: string | null = null; // Temporary ID within this async scope

    const executeStream = async () => {
      try {
        const apiMessages = messagePath.map(node => ({ role: node.role, content: node.content }));

        const callbacks: StreamCallbacks = {
          onChunk: (chunk) => {
            if (!tempAiNodeId) {
              // First chunk: Create the AI message node
              
              // --- Prepare metadata for the actual AI response node ---
              // Only include branchId if it exists in the pendingMetadata
              const responseMetadata: Record<string, any> = {};
              if (metadata?.branchId) {
                responseMetadata.branchId = metadata.branchId;
              }
              // Optionally add other relevant metadata, but EXCLUDE selectedText, isBranchStart, etc.
              // ---------------------------------------------------------
              
              const firstChunkData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'> = {
                role: 'assistant',
                content: chunk,
                metadata: responseMetadata // Use the cleaned metadata
              };
              const newAiResult = addMessage(firstChunkData, aiParentId);
              if (newAiResult) {
                tempAiNodeId = newAiResult.newNode.id;
                setStreamingAiNodeId(tempAiNodeId); // Store in state for subsequent updates
              } else {
              }
            } else {
              // Subsequent chunks: Update the existing node
              updateMessageContent(tempAiNodeId, chunk);
            }
          },
          onComplete: () => {
            if (!session) {
              const newCount = guestMessageCount + 1;
              setGuestMessageCount(newCount);
            }
            setIsSending(false);
            setStreamingAiNodeId(null);
          },
          onError: (llmError) => {
            setError(llmError);
            setIsSending(false);
            setStreamingAiNodeId(null);
          }
        };

        // Pass the full messagePath which includes id and createdAt
        await generateCompletionStream(messagePath, callbacks, additionalSystemPrompt);

      } catch (err) { // Catch errors during stream *setup*
        const setupError: LLMError = {
          type: ErrorType.UNKNOWN,
          message: err instanceof Error ? err.message : 'Failed to start AI stream.',
          original: err,
        };
        setError(setupError);
        setIsSending(false);
      } finally {
        setPendingLlmCall(null); // Clear the trigger regardless of success/failure
      }
    };

    executeStream();

  }, [pendingLlmCall, guestMessageCount, session, additionalSystemPrompt]); // Added additionalSystemPrompt to dependency array

  const handleSendMessage = async (text: string) => {
    setIsSending(true);
    setError(null);
    setStreamingAiNodeId(null); // Reset streaming ID on new message
    setShowingMainThread(false);

    // --- Guest Rate Limit Check --- 
    if (!session) { 
      if (guestMessageCount >= GUEST_MESSAGE_LIMIT) {
        setError({ 
          type: ErrorType.QUOTA_EXCEEDED, // Using QUOTA_EXCEEDED type
          message: `Message limit reached (${guestMessageCount}/${GUEST_MESSAGE_LIMIT}). Please log in or register to continue.` 
        });
        setIsSending(false);
        return;
      }
    }
    // --- End Guest Rate Limit Check ---

    // If we're in a branch view, add the branch metadata to the message
    let metadata = undefined;
    
    if (branchParentId && conversation?.messages) {
      // Find the branch starter message to get its branchId
      const branchStarterMessages = Object.values(conversation.messages)
        .filter((msg: MessageNode) => 
          msg.parentId === branchParentId && 
          msg.metadata?.isBranchStart === true
        );
        
      if (branchStarterMessages.length > 0) {
        // Sort by createdAt to get the most recently selected branch
        branchStarterMessages.sort((a: MessageNode, b: MessageNode) => 
          b.createdAt.getTime() - a.createdAt.getTime()
        );
        
        const currentBranchId = branchStarterMessages[0].metadata?.branchId;
        
        if (currentBranchId) {
          // Add branch metadata to maintain branch context
          metadata = { branchId: currentBranchId };
        }
      }
    }

    const userMessageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'> = {
      role: 'user',
      content: text,
      metadata
    };
    const addResult = addMessage(userMessageData);

    if (!addResult) {
      setError({ type: ErrorType.UNKNOWN, message: 'Failed to add user message locally.' });
      setIsSending(false);
      return;
    }

    // --- Generate Title for New Conversations --- 
    // Use the messagePath returned by addResult, as it includes the new message immediately
    const isFirstUserMessage = addResult.messagePath && 
      addResult.messagePath.filter(msg => msg.role === 'user').length === 1; 

    // We also need the conversation ID, so check conversation exists too
    if (addResult && conversation && isFirstUserMessage) {
      // Don't await this - let it run in the background
      generateTitle(text).then(generatedTitle => {
        if (generatedTitle && generatedTitle !== "New Chat") {
          updateConversationTitle(conversation.id, generatedTitle);
        }
      }).catch(err => {
        // Silently handle errors in background title generation
      });
    }
    // --- End Title Generation ---

    // --- Set state to trigger LLM call via useEffect ---
    // When in a branch, ensure we only include messages relevant to this branch
    if (branchId && metadata?.branchId) {
      // Construct a properly ordered message path for branch context
      // 1. Get all messages from the conversation
      const allMessages = Object.values(conversation?.messages || {});
      
      // 2. Find the branch starter message (first message in this branch)
      const branchStarter = allMessages.find(msg => 
        msg.metadata?.branchId === metadata.branchId && 
        msg.metadata?.isBranchStart === true
      );
      
      // 3. If we found the branch starter, get its parent (the message containing the highlighted text)
      const highlightParent = branchStarter?.parentId ? conversation?.messages[branchStarter.parentId] : null;
      
      // 4. Collect system messages (instructions)
      const systemMessages = allMessages.filter(msg => msg.role === 'system');
      
      // 5. Get parent context (messages before the highlighted text, limited to 5 messages)
      const parentContext = [];
      if (highlightParent) {
        // Find messages leading up to the highlighted text's parent
        const tempContext = [];
        let currentId = highlightParent.id || null;
        
        // Walk up the tree to collect parent context
        while (currentId && tempContext.length < 5) {
          const msg = conversation?.messages[currentId];
          if (msg) {
            tempContext.unshift(msg); // Add to front to maintain order
            currentId = msg.parentId;
          } else {
            break;
          }
        }
        
        // Add the collected context
        parentContext.push(...tempContext);
      }
      
      // 6. Get current branch messages (excluding the new message which we'll add last)
      const branchMessages = allMessages.filter(msg => 
        msg.metadata?.branchId === metadata.branchId && 
        msg.id !== addResult.newNode.id
      ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      // 7. Construct the properly ordered message path
      const orderedPath = [
        ...systemMessages,         // System instructions first
        ...parentContext,          // Parent context next
        ...branchMessages,         // Branch messages in chronological order
        addResult.newNode          // Current user message last
      ];
      
      setPendingLlmCall({ 
        parentId: addResult.newNode.id,
        path: orderedPath,
        metadata
      });
    } else {
      // Not in a branch or no branch ID, use the full path
      setPendingLlmCall({ 
        parentId: addResult.newNode.id,
        path: addResult.messagePath,
        metadata
      });
    }
  }

  // Handler for when a branch is successfully created in ChatMessage
  const handleBranchCreated = (branchResult: AddMessageResult, sourceText: string, isAutoExplain: boolean) => {
    if (branchResult.newNode.parentId) { 
      // Store the branch ID from the node metadata
      const currentBranchId = branchResult.newNode.metadata?.branchId || null;
      
      // Get truncated text for display
      const truncatedText = sourceText.length > 60 ? sourceText.substring(0, 57) + '...' : sourceText;
      
      // Add this branch to the stack
      const newBranchInfo = {
        parentId: branchResult.newNode.parentId,
        branchId: currentBranchId,
        sourceText: truncatedText
      };
      
      // Update the branch stack (keeping previous branch history)
      setBranchStack(prev => [...prev, newBranchInfo]);
      
      // Store branch node ID directly for simpler access
      const branchNodeId = branchResult.newNode.id;
      
      // Only generate a response if this is an auto-explain branch
      if (isAutoExplain) {
        // Get the parent message for context
        const parentMessage = conversation?.messages?.[branchResult.newNode.parentId];
        const parentContent = parentMessage ? parentMessage.content : '';
        const parentRole = parentMessage ? parentMessage.role : 'user';
        
        // Create a more focused message path for the LLM to respond specifically to the selected text
        // Include system messages, parent message for context, and a synthetic user message with the selected text
        const focusedPath = currentMessages
          .filter(msg => msg.role === 'system')
          .concat([
            // Add parent message for context if it exists and isn't a system message
            ...(parentMessage && parentRole !== 'system' ? [{
              id: 'context-parent-msg',
              role: parentRole as 'user' | 'assistant', // Type cast to prevent TS errors
              content: parentContent,
              parentId: null,
              createdAt: new Date(),
              metadata: { isContextMessage: true }
            } as MessageNode] : []),
            // Add the focused message about the selected text
            {
              id: 'synthetic-user-msg',
              role: 'user',
              content: `Explain ONLY this exact highlighted text: "${sourceText}"
Do not ask for clarification. Focus specifically on explaining this exact text, not any other words that may appear in context.
${sourceText.length > 100 ? 'For this longer selection, explain its key points and significance.' : 'Be direct and concise with your explanation.'}`, 
              parentId: null,
              createdAt: new Date(),
              metadata: branchResult.newNode.metadata // Use the same metadata
            } as MessageNode
          ]);
        
        // When a branch is created, immediately set up an LLM call to generate content
        // with the focused message path so it responds to the selected text
        setPendingLlmCall({ 
          parentId: branchNodeId, 
          path: focusedPath,
          metadata: branchResult.newNode.metadata // Use the same metadata from the branch node
        });
      } else {
        // For regular branches, just navigate to the branch without generating new content
        // Ensure we activate the correct message ID when navigating to an existing branch
        if (branchNodeId !== activeMessageId) {
            setActiveMessageId(branchNodeId);
        }
      }
    }
  };

  // Handler for clicking the back button in branch view
  const handleGoBack = () => {
    // With branch stack, going back is simply popping the top item off the stack
    if (branchStack.length > 0) {
      // Get the parent ID from the current branch (top of stack)
      const currentBranchParentId = branchStack[branchStack.length - 1].parentId;
      
      // Set active message ID to the parent we're returning to
      setActiveMessageId(currentBranchParentId);
      
      if (branchStack.length > 1) {
        // If we have more than one branch in the stack, we're going back to a previous branch
        setBranchStack(prev => prev.slice(0, -1));
      } else {
        // If we only have one branch, we're exiting branch view entirely
        setBranchStack([]);
      }
    }
  };

  // --- Filter messages for display ---
  let displayedMessages = currentMessages;
  if (showingMainThread && conversation) {
    displayedMessages = getMainThreadPath(conversation);
  }
  if (branchParentId) {
    // Find any branch messages that have the branch parent
    const branchParentNode = conversation?.messages?.[branchParentId];
    
    if (branchParentNode) {
      // Get all messages in the conversation
      const allMessages = Object.values(conversation?.messages || {});
      let branchMessages: MessageNode[] = [];
      
      // If we have a specific branch ID, use it for precise filtering
      if (branchId) {
        // Get the branch starter node (direct child of parent with this branch ID)
        // This is the message with isBranchStart that initiates a branch
        const branchStarter = allMessages.find(msg => 
          msg.parentId === branchParentId && 
          msg.metadata?.branchId === branchId &&
          msg.metadata?.isBranchStart === true
        );
        
        if (branchStarter) {
          // Include messages that belong to this branch:
          // 1. Include the branch starter
          // 2. Include messages explicitly tagged with the same branchId
          branchMessages = allMessages.filter(msg => {
            // Include the branch starter itself
            if (msg.id === branchStarter.id) return true;
            // Include messages explicitly tagged with this branch ID
            if (msg.metadata?.branchId === branchId) return true;
            // Do NOT include descendants with a different branchId
            return false;
          });
        } else {
          // Fallback to just using branchId for filtering (less reliable)
          branchMessages = allMessages.filter(msg => 
            msg.metadata?.branchId === branchId || 
            msg.parentId === branchParentId
          );
        }
      } 
      
      // If no branch ID or no messages found with branch ID, fall back to parent-based filtering
      if (branchMessages.length === 0) {
        // Show all direct children of the branch parent
        branchMessages = allMessages.filter(msg => {
          // Skip the parent itself
          if (msg.id === branchParentId) return false;
          
          // Check if this is a direct child of the parent
          if (msg.parentId === branchParentId) return true;
          
          // Or check if it's a descendant of any direct child by walking up the parent chain
          let parentId = msg.parentId;
          while (parentId) {
            const parent = conversation?.messages?.[parentId];
            if (!parent) break;
            
            if (parent.parentId === branchParentId) return true;
            parentId = parent.parentId;
          }
          
          return false;
        });
      }
      
      // Sort by createdAt to ensure proper order
      branchMessages.sort((a: MessageNode, b: MessageNode) => {
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      
      if (branchMessages.length > 0) {
        displayedMessages = branchMessages;
      } else {
        displayedMessages = []; // Empty until AI response comes back
      }
    }
  }

  // Determine guest limit warning
  const guestLimitWarning = !session && guestMessageCount >= GUEST_MESSAGE_LIMIT * 0.8 
    ? `${guestMessageCount} / ${GUEST_MESSAGE_LIMIT} messages used`
    : null;

  // Loading state while checking auth
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    )
  }

  const animationVariants = {
    initial: {
      opacity: 0,
      x: -50, // Slide in from left
    },
    animate: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.3, ease: "easeInOut" },
    },
    exit: {
      opacity: 0,
      x: 50, // Slide out to right
      transition: { duration: 0.3, ease: "easeInOut" },
    },
  };

  return (
    // Layout: side panel (ChatHistory) and main content
    <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Animated Chat History panel */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            initial={{ width: 0, opacity: 1 }}
            animate={{ width: '20rem', opacity: 1 }}
            exit={{ width: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="flex-shrink-0 h-full z-20 overflow-hidden bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
            style={{ boxShadow: isHistoryOpen ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none' }}
          >
            <ChatHistory 
              onClose={() => {
                console.log('Sidebar closing via onClose callback');
                setIsHistoryOpen(false);
              }} 
              onLoadConversation={() => {
                console.log('Loading conversation, keeping sidebar open');
                // Only reset branch stack, don't close sidebar
                setBranchStack([]);
              }} 
              activeConversationId={conversation?.id}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 shrink-0 relative">
          {/* Left Side: Show logo title */}
          {branchStack.length === 0 && (
            <div className="flex items-center gap-2">
              <img src="/Navi Logos/PNG_Navi-removebg-preview.png" alt="Navi" className="h-10 w-auto" />
            </div>
          )}

          {/* Center Content: Empty */}

          {/* Right Side: Auth Controls (always show unless back button logic changes this) */}
          {/* Currently shows when not in branch view - this seems correct */}
          {branchStack.length === 0 && (
              <div className="flex items-center gap-4 relative"> {/* Added relative positioning for dropdown */}
                  {/* Bug Report Button */}
                  <BugReportButton buttonText="Report Bug" className="text-sm cursor-pointer" />
                  
                  {/* Guest Limit Warning */}
                  {guestLimitWarning && (
                      <span className={`text-sm font-medium ${guestMessageCount >= GUEST_MESSAGE_LIMIT * 0.9 ? 'text-red-500' : 'text-yellow-500'} hidden md:inline`}>
                          {guestLimitWarning}
                      </span>
                  )}
                  {/* Auth Controls / User Info */}
                  {session ? (
                      <div className="relative"> {/* Wrapper for button and dropdown */}
                          <button
                              ref={profileButtonRef} // Attach ref
                              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)} // Toggle dropdown
                              className="flex items-center justify-center h-8 w-8 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-blue-500 cursor-pointer overflow-hidden" // Adjusted focus rings
                              aria-label="Profile menu"
                              title="Profile menu"
                              aria-haspopup="true"
                              aria-expanded={isProfileDropdownOpen}
                          >
                              {user?.user_metadata?.avatar_url ? (
                                  <img 
                                      src={user.user_metadata.avatar_url} 
                                      alt="User profile" 
                                      className="h-full w-full object-cover" // Ensure image covers the button area
                                  />
                              ) : (
                                  <FiUser className="h-5 w-5" /> // Default icon
                              )}
                          </button>
                          
                          {/* Profile Dropdown Menu */} 
                          <AnimatePresence>
                              {isProfileDropdownOpen && (
                                  <motion.div
                                      ref={dropdownRef} // Attach ref
                                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                      transition={{ duration: 0.15, ease: "easeOut" }}
                                      className="absolute right-0 mt-2 w-48 origin-top-right bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 focus:outline-none z-50"
                                      role="menu"
                                      aria-orientation="vertical"
                                      aria-labelledby="profile-menu-button"
                                  >
                                      <div className="p-1" role="none">
                                          <button
                                              onClick={() => {
                                                  openProfileModal();
                                                  setIsProfileDropdownOpen(false); // Close dropdown after click
                                              }}
                                              className="w-full text-left block px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                                              role="menuitem"
                                          >
                                              Settings
                                          </button>
                                          <button
                                              onClick={() => {
                                                  signOut();
                                                  setIsProfileDropdownOpen(false); // Close dropdown after click
                                              }}
                                              className="w-full text-left block px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                                              role="menuitem"
                                          >
                                              Sign Out
                                          </button>
                                      </div>
                                  </motion.div>
                              )}
                          </AnimatePresence>
                      </div>
                  ) : (
                      <button 
                          onClick={openAuthModal}
                          className="flex items-center gap-1 py-2 px-3 bg-black text-white rounded-md hover:bg-gray-800 text-sm font-semibold transition-colors cursor-pointer"
                      >
                          Login / Register
                      </button>
                  )}
              </div>
          )}
        </header>

        {/* Left Sidebar Icons (only for logged-in users) */}
        {session && (
          <div className="absolute top-16 left-0 p-4 z-10 flex gap-2">
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Open History"
            >
              <FiMenu className="h-5 w-5" />
            </button>
            <button 
              onClick={() => { 
                startNewConversation(); 
                setBranchStack([]);
                // Keep the history sidebar open and make sure it knows we started a new chat
                setIsHistoryOpen(true);
                // Clear any error messages that might be showing
                setError(null);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-850 transition-colors"
              title="Start a new conversation thread"
            >
              <FiEdit className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* --- Animated Main Content Area --- */}
        <AnimatePresence mode="wait">
          {/* Add relative positioning to main for the absolute back button */}
          <motion.main
            key={branchParentId ? `branch-${branchParentId}-${branchId}` : 'main'}
            className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col space-y-0 w-full max-w-4xl mx-auto relative" // Added relative
            variants={animationVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Moved Back Button Here */}
            {branchStack.length > 0 && (
              <button
                onClick={handleGoBack}
                className="absolute top-4 left-4 z-10 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 focus:outline-none rounded-full p-1 transition-colors bg-transparent hover:bg-gray-200 dark:hover:bg-gray-300"
                aria-label="Go back"
                title="Go back"
              >
                <FiArrowLeft className="h-5 w-5 transition-colors" />
              </button>
            )}

            {/* Show breadcrumb-style navigation for nested branches */}
            {branchStack.length > 0 && (
              <div className="text-sm italic text-gray-500 dark:text-gray-400 text-center mb-4 pt-10 flex-shrink-0">
                {branchStack.length > 1 ? (
                  <div className="flex flex-wrap justify-center items-center gap-1">
                    <span>Branches:</span>
                    <span 
                      onClick={() => {
                        setBranchStack([]);
                        setActiveMessageId(conversation?.rootMessageId || null);
                        setShowingMainThread(true);
                      }}
                      className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 relative group"
                      title="Return to main conversation"
                    >
                      Main
                    </span>
                    <span className="mx-1">→</span>
                    {branchStack.map((branch, index) => (
                      <React.Fragment key={`branch-${index}`}>
                        {index > 0 && <span className="mx-1">→</span>}
                        <span 
                          onClick={() => {
                            // Navigate to this specific branch by truncating the stack
                            setBranchStack(prev => prev.slice(0, index + 1));
                            // If this branch has an associated node ID, set it as active
                            if (index > 0 && branchStack[index].branchId) {
                              // Find the branch starter node for this branch
                              const allMessages = Object.values(conversation?.messages || {});
                              const branchStarter = allMessages.find(msg => 
                                msg.metadata?.branchId === branchStack[index].branchId &&
                                msg.metadata?.isBranchStart === true
                              );
                              if (branchStarter) {
                                setActiveMessageId(branchStarter.id);
                              } else {
                                // Fallback to parent ID if branch starter not found
                                setActiveMessageId(branchStack[index].parentId);
                              }
                            } else if (index === 0) {
                              // For the first branch, use its parent ID directly
                              setActiveMessageId(branchStack[0].parentId);
                            }
                          }}
                          className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                          title={`Navigate to ${branch.sourceText || `Branch ${index + 1}`}`}
                        >
                          {branch.sourceText || `Branch ${index + 1}`}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div>Based off of: "{branchSourceText}"</div>
                )}
              </div>
            )}

            {/* Pass filtered messages */}
            <ChatThread
              messages={displayedMessages}
              isLoading={isSending}
              streamingNodeId={streamingAiNodeId}
              onBranchCreated={handleBranchCreated}
            />
          </motion.main>
        </AnimatePresence>
        {/* --- End Animated Main Content Area --- */}

        {error && (
          <div className={`p-2 text-center text-sm ${error.type === ErrorType.QUOTA_EXCEEDED ? 'text-orange-600 bg-orange-100 border-orange-200' : 'text-red-600 bg-red-100 border-red-200'} border-t`}>
            Error: {error.message}
          </div>
        )}

        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pb-2">
          {!session && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-1">
                  Chat history isn't saved for guest users. 
                  <span onClick={openAuthModal} className="text-blue-500 hover:underline cursor-pointer ml-1">Login/Register </span> 
                  to save your conversations.
              </p>
          )}
          <ChatInput onSendMessage={handleSendMessage} isLoading={isSending} />
        </div>
        
        {/* --- Render Auth Modal --- */}
        <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />
        
        {/* --- Render Profile Modal --- */}
        <ProfileModal 
          isOpen={isProfileModalOpen} 
          onClose={closeProfileModal} 
          onProfileUpdate={handleProfileUpdate}
        />
        {/* ------------------------- */}
        
      </div>
    </div>
  )
}

function App() {
  // Initialize custom styling from saved preferences
  useEffect(() => {
    // Initialize highlight color from localStorage if available
    const savedHighlightColor = localStorage.getItem('branchHighlightColor');
    if (savedHighlightColor) {
      document.documentElement.style.setProperty('--branch-highlight-color', savedHighlightColor);
    }
  }, []);

  return (
    <AuthProvider>
      <ConversationProvider>
        <AppContent />
      </ConversationProvider>
    </AuthProvider>
  )
}

export default App
