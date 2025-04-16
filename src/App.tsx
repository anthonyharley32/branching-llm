import React, { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import ChatMessage from './components/ChatMessage'
import ChatInput from './components/ChatInput'
import ChatThread from './components/ChatThread'
import { ConversationProvider, useConversation, AddMessageResult } from './context/ConversationContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthContainer from './components/auth/AuthContainer'
import { 
  generateCompletionStream,
  LLMError, 
  ErrorType, 
  StreamCallbacks
} from './services/llm/openai'
import { MessageNode } from './types/conversation'
import { FiLogOut, FiArrowLeft, FiX } from 'react-icons/fi'
import { supabase } from './lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'

// --- Constants ---
const GUEST_MESSAGE_LIMIT = 1000;
const GUEST_MESSAGE_COUNT_KEY = 'LearningLLM_guest_message_count';

function AppContent() {
  const { user, isLoading: isAuthLoading, session, signOut } = useAuth();
  const { 
    currentMessages, 
    addMessage, 
    activeMessageId,
    setActiveMessageId,
    selectBranch,
    updateMessageContent,
    conversation
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

  // Load guest message count from localStorage on initial load if not logged in
  useEffect(() => {
    if (!isAuthLoading && !session) {
      try {
        const storedCount = localStorage.getItem(GUEST_MESSAGE_COUNT_KEY);
        const count = storedCount ? parseInt(storedCount, 10) : 0;
        if (!isNaN(count)) {
            setGuestMessageCount(count);
            console.log('Loaded guest message count:', count);
        } else {
            // Handle case where stored value is invalid
            localStorage.removeItem(GUEST_MESSAGE_COUNT_KEY);
            setGuestMessageCount(0);
        }
      } catch (err) {
        console.error('Failed to load guest message count from localStorage:', err);
        setGuestMessageCount(0); // Default to 0 on error
      }
    }
  }, [isAuthLoading, session]); // Run when auth state is determined

  // --- Effect to initiate LLM stream after user message state is updated ---
  useEffect(() => {
    if (!pendingLlmCall) return;

    const { parentId: aiParentId, path: messagePath, metadata } = pendingLlmCall;
    let tempAiNodeId: string | null = null; // Temporary ID within this async scope

    const executeStream = async () => {
      try {
        const apiMessages = messagePath.map(node => ({ role: node.role, content: node.content }));
        console.log('Sending context to LLM (useEffect):', apiMessages);

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
                console.error("Failed to add first AI chunk message");
                setError({ type: ErrorType.UNKNOWN, message: 'Failed to add first AI message.' });
                // Maybe stop processing stream?
              }
            } else {
              // Subsequent chunks: Update the existing node
              updateMessageContent(tempAiNodeId, chunk);
            }
          },
          onComplete: () => {
            console.log("LLM Stream Complete");
            if (!session) {
              const newCount = guestMessageCount + 1;
              setGuestMessageCount(newCount);
              try {
                localStorage.setItem(GUEST_MESSAGE_COUNT_KEY, newCount.toString());
                console.log(`Guest message count updated: ${newCount}`);
              } catch (err) {
                console.error('Failed to save guest message count to localStorage:', err);
              }
            }
            setIsSending(false);
            setStreamingAiNodeId(null);
          },
          onError: (llmError) => {
            console.error("LLM Stream Error:", llmError);
            setError(llmError);
            setIsSending(false);
            setStreamingAiNodeId(null);
          }
        };

        await generateCompletionStream(apiMessages, callbacks);

      } catch (err) { // Catch errors during stream *setup* 
        console.error("Failed to initiate AI stream (useEffect):", err);
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

  }, [pendingLlmCall, guestMessageCount, session]); // Removed addMessage/updateMessageContent

  const handleSendMessage = async (text: string) => {
    setIsSending(true);
    setError(null);
    setStreamingAiNodeId(null); // Reset streaming ID on new message

    // --- Guest Rate Limit Check --- 
    if (!session) { 
      if (guestMessageCount >= GUEST_MESSAGE_LIMIT) {
        console.log(`Guest hit message limit (${guestMessageCount}/${GUEST_MESSAGE_LIMIT}).`);
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
          console.log(`Adding message to branch: ${currentBranchId}`);
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
      console.error('Failed to add user message to context');
      setError({ type: ErrorType.UNKNOWN, message: 'Failed to add user message locally.' });
      setIsSending(false);
      return;
    }

    // --- Set state to trigger LLM call via useEffect --- 
    setPendingLlmCall({ 
      parentId: addResult.newNode.id,
      path: addResult.messagePath,
      metadata // Pass branch metadata to ensure LLM response stays in the branch
    });
  }

  // Handler for when a branch is successfully created in ChatMessage
  const handleBranchCreated = (branchResult: AddMessageResult, sourceText: string, isNewBranch: boolean) => {
    if (branchResult.newNode.parentId) { 
      // Add debug logs for branch creation
      console.log("DEBUG handleBranchCreated:");
      console.log("- newNode:", {
        id: branchResult.newNode.id, 
        role: branchResult.newNode.role,
        parentId: branchResult.newNode.parentId,
        metadata: branchResult.newNode.metadata,
        content: branchResult.newNode.content.substring(0, 30) + "..."
      });
      
      // Log current branch stack
      console.log("- Current branch stack:", branchStack);
      
      // If we can, check for the parent
      const parentNode = conversation?.messages?.[branchResult.newNode.parentId];
      console.log("- parentNode:", parentNode ? {
        id: parentNode.id,
        role: parentNode.role,
        parentId: parentNode.parentId,
        metadata: parentNode.metadata,
      } : "null");
      
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
      
      console.log(`Entering branch view. Parent: ${branchResult.newNode.parentId}, BranchId: ${currentBranchId}, Source: "${truncatedText}"`);
      
      // Store branch node ID directly for simpler access
      const branchNodeId = branchResult.newNode.id;
      console.log(`Branch node ID: ${branchNodeId}`);
      
      console.log(`Is new branch (from callback): ${isNewBranch}`);
      
      // Only generate a response if this is a new branch (using the passed flag)
      if (isNewBranch) {
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
              content: `Regarding this highlighted text: "${sourceText}"
${sourceText.length > 100 ? 'Consider the broader context from which this was selected.' : ''}`, 
              parentId: null,
              createdAt: new Date(),
              metadata: branchResult.newNode.metadata // Use the same metadata
            } as MessageNode
          ]);
        
        console.log(`Creating branch with ${focusedPath.length} messages, including parent context`);
        
        // When a branch is created, immediately set up an LLM call to generate content
        // with the focused message path so it responds to the selected text
        setPendingLlmCall({ 
          parentId: branchNodeId, 
          path: focusedPath,
          metadata: branchResult.newNode.metadata // Use the same metadata from the branch node
        });
      } else {
        console.log(`Navigating to existing branch with content: "${branchResult.newNode.content.substring(0, 30)}..."`);
        // For existing branches, just navigate to the branch without generating new content
        // Ensure we activate the correct message ID when navigating to an existing branch
        if (branchNodeId !== activeMessageId) {
            setActiveMessageId(branchNodeId);
        }
      }
    } else {
      console.error("Branch created but newNode lacks parentId?", branchResult.newNode);
    }
  };

  // Handler for clicking the back button in branch view
  const handleGoBack = () => {
    // With branch stack, going back is simply popping the top item off the stack
    if (branchStack.length > 0) {
      // Log the current state before we change it
      console.log("Going back from current branch:", branchStack[branchStack.length - 1]);
      
      // Get the parent ID from the current branch (top of stack)
      const currentBranchParentId = branchStack[branchStack.length - 1].parentId;
      
      // Set active message ID to the parent we're returning to
      setActiveMessageId(currentBranchParentId);
      
      if (branchStack.length > 1) {
        // If we have more than one branch in the stack, we're going back to a previous branch
        console.log("Going back to previous branch:", branchStack[branchStack.length - 2]);
        
        // Remove the top branch from the stack (keeping the rest of the branch history)
        setBranchStack(prev => prev.slice(0, -1));
      } else {
        // If we only have one branch, we're exiting branch view entirely
        console.log("Exiting branch view");
        setBranchStack([]);
      }
    } else {
      console.warn('handleGoBack called but branch stack is empty');
    }
  };

  // --- Filter messages for display ---
  let displayedMessages = currentMessages;
  if (branchParentId) {
    console.log("DEBUG FILTER MESSAGES:");
    console.log("- branchStack:", branchStack);
    console.log("- Current branch (top of stack):", branchStack[branchStack.length - 1]);
    console.log("- activeMessageId:", activeMessageId);
    
    // Find any branch messages that have the branch parent
    const branchParentNode = conversation?.messages?.[branchParentId];
    console.log("- branchParentNode:", branchParentNode ? {
      id: branchParentNode.id,
      role: branchParentNode.role,
      parentId: branchParentNode.parentId,
      metadata: branchParentNode.metadata,
    } : "null");
    
    if (branchParentNode) {
      // Get all messages in the conversation
      const allMessages = Object.values(conversation?.messages || {});
      let branchMessages: MessageNode[] = [];
      
      // If we have a specific branch ID, use it for precise filtering
      if (branchId) {
        console.log(`Filtering messages with branchId: ${branchId}`);
        
        // Get the branch starter node (direct child of parent with this branch ID)
        // This is the message with isBranchStart that initiates a branch
        const branchStarter = allMessages.find(msg => 
          msg.parentId === branchParentId && 
          msg.metadata?.branchId === branchId &&
          msg.metadata?.isBranchStart === true
        );
        
        if (branchStarter) {
          console.log(`Found branch starter node: ${branchStarter.id}`);
          console.log("- branchStarter:", {
            id: branchStarter.id,
            role: branchStarter.role,
            parentId: branchStarter.parentId,
            metadata: branchStarter.metadata,
          });
          
          // Include messages that belong to this branch:
          // 1. Include the branch starter
          // 2. Include direct and indirect descendants of the branch starter
          // 3. Include messages explicitly tagged with the same branchId
          branchMessages = allMessages.filter(msg => {
            // Include the branch starter itself
            if (msg.id === branchStarter.id) return true;
            
            // Include messages explicitly tagged with this branch ID
            if (msg.metadata?.branchId === branchId) return true;
            
            // Include messages that are descendants of the branch starter
            // by walking up the parentId chain
            let currentId = msg.parentId;
            while (currentId) {
              // If we reach the branch starter, this message is part of this branch
              if (currentId === branchStarter.id) return true;
              
              // Stop if we reach the branch parent (don't go past it)
              if (currentId === branchParentId) break;
              
              // Move up the tree
              currentId = conversation?.messages?.[currentId]?.parentId || null;
            }
            
            return false;
          });
          
          // Debug the branch structure
          console.log("BRANCH STRUCTURE:");
          const messageStructure = branchMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            parentId: msg.parentId,
            content: msg.content.substring(0, 20) + "...",
            isBranchStart: msg.metadata?.isBranchStart,
            branchId: msg.metadata?.branchId
          }));
          console.log(messageStructure);
        } else {
          console.warn(`Could not find branch starter node with branchId: ${branchId}`);
          
          // Fallback to just using branchId for filtering (less reliable)
          branchMessages = allMessages.filter(msg => 
            msg.metadata?.branchId === branchId || 
            msg.parentId === branchParentId
          );
        }
      } 
      
      // If no branch ID or no messages found with branch ID, fall back to parent-based filtering
      if (branchMessages.length === 0) {
        console.log("Using fallback parent-based filtering");
        
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
        console.log(`Found ${branchMessages.length} messages in branch`);
        console.log("- Branch messages IDs:", branchMessages.map(m => m.id));
      } else {
        console.warn("No messages found in branch. It may be newly created.");
        displayedMessages = []; // Empty until AI response comes back
      }
    } else {
      console.warn("Could not find branch parent in conversation.");
      displayedMessages = [];
    }
  } else {
    console.log("Not in branch view. Using currentMessages:", currentMessages.map(m => m.id));
  }
  // --- End Filter ---

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
    <div className="flex flex-col h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      <header className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 shrink-0 relative">
        {/* Left Side: Show logo title */}
        {/* Back button moved to main content area */}
        {branchStack.length === 0 && (
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">LearningLLM</h1>
          </div>
        )}

        {/* Center Content: Empty */}

        {/* Right Side: Auth Controls (always show unless back button logic changes this) */}
        {/* Currently shows when not in branch view - this seems correct */}
        {branchStack.length === 0 && (
            <div className="flex items-center gap-4">
                {/* Guest Limit Warning */}
                {guestLimitWarning && (
                    <span className={`text-sm font-medium ${guestMessageCount >= GUEST_MESSAGE_LIMIT * 0.9 ? 'text-red-500' : 'text-yellow-500'} hidden md:inline`}>
                        {guestLimitWarning}
                    </span>
                )}
                {/* Auth Controls / User Info */}
                {session ? (
                    <>
                        {user?.email && (
                            <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline">
                                {user.email}
                            </span>
                        )}
                        <button 
                            onClick={signOut}
                            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                            aria-label="Logout"
                            title="Logout"
                        >
                            <FiLogOut className="h-5 w-5" />
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={() => {
                            console.log("TODO: Show Auth Modal/View");
                        }}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
                    >
                        Login / Register
                    </button>
                )}
            </div>
        )}
      </header>

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
              className="absolute top-4 left-4 z-10 text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded-full p-1"
              aria-label="Go back"
              title="Go back"
            >
              <FiArrowLeft className="h-5 w-5" />
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
                      // Clear the entire branch stack to return to main conversation
                      setBranchStack([]);
                      // Set active message to the root of the conversation
                      setActiveMessageId(conversation?.rootMessageId || null);
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
                <button onClick={() => console.log("TODO: Show Auth Modal")} className="text-blue-500 hover:underline ml-1">Login/Register</button> 
                to save your conversations.
            </p>
        )}
        <ChatInput onSendMessage={handleSendMessage} isLoading={isSending} />
      </div>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <ConversationProvider>
        <AppContent />
      </ConversationProvider>
    </AuthProvider>
  )
}

export default App
