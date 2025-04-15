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
import { generateCompletion, LLMError, ErrorType } from './services/llm/openai'
import { MessageNode } from './types/conversation'
import { FiLogOut, FiArrowLeft, FiX } from 'react-icons/fi'
import { supabase } from './lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'

// --- Constants ---
const GUEST_MESSAGE_LIMIT = 1000;
const GUEST_MESSAGE_COUNT_KEY = 'supergrok_guest_message_count';

function AppContent() {
  const { user, isLoading: isAuthLoading, session, signOut } = useAuth();
  const { 
    currentMessages, 
    addMessage, 
    activeMessageId,
    setActiveMessageId,
    selectBranch,
  } = useConversation();

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<LLMError | null>(null)
  const [guestMessageCount, setGuestMessageCount] = useState<number>(0); // State for guest count
  const [branchParentId, setBranchParentId] = useState<string | null>(null); // State for branched view
  const [branchSourceText, setBranchSourceText] = useState<string | null>(null); // State for source text

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

  const handleSendMessage = async (text: string) => {
    setIsSending(true);
    setError(null)

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

    const userMessageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'> = {
      role: 'user',
      content: text,
    }
    const addResult = addMessage(userMessageData)

    if (!addResult) {
      console.error('Failed to add user message to context')
      setError({ type: ErrorType.UNKNOWN, message: 'Failed to add user message locally.'})
      setIsSending(false);
      return
    }

    const { newNode: userMessageNode, messagePath: userMessagePath } = addResult

    try {
      const apiMessages = userMessagePath.map(node => ({ role: node.role, content: node.content }))

      console.log('Sending context to LLM:', apiMessages)

      const aiResponse = await generateCompletion(apiMessages)

      const aiMessageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'> = {
        role: aiResponse.role,
        content: aiResponse.content,
      }
      addMessage(aiMessageData, userMessageNode.id)

      // --- Increment Guest message count --- 
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

    } catch (err) {
      console.error("Failed to get AI response:", err)
      if (err instanceof Error && 'type' in err && Object.values(ErrorType).includes((err as LLMError).type)) {
        setError(err as LLMError)
      } else {
        setError({
          type: ErrorType.UNKNOWN,
          message: err instanceof Error ? err.message : 'An unexpected error occurred.',
          original: err,
        })
      }
    } finally {
      setIsSending(false);
    }
  }

  // Handler for when a branch is successfully created in ChatMessage
  const handleBranchCreated = (branchResult: AddMessageResult, sourceText: string) => {
    if (branchResult.newNode.parentId) { 
      setBranchParentId(branchResult.newNode.parentId);
      const truncatedText = sourceText.length > 60 ? sourceText.substring(0, 57) + '...' : sourceText;
      setBranchSourceText(truncatedText);
      console.log(`Entering branch view. Parent: ${branchResult.newNode.parentId}, Source: "${truncatedText}"`);
    } else {
      console.error("Branch created but newNode lacks parentId?", branchResult.newNode);
    }
  };

  // Handler for clicking the back button in branch view
  const handleGoBack = () => {
    if (branchParentId) {
      console.log("Going back to parent:", branchParentId);
      setActiveMessageId(branchParentId); // Navigate back in context
      setBranchParentId(null);
      setBranchSourceText(null);
    } else {
      console.warn('handleGoBack called but no branchParentId set');
    }
  };

  // --- Filter messages for display ---
  let displayedMessages = currentMessages;
  if (branchParentId) {
    const parentIndex = currentMessages.findIndex(msg => msg.id === branchParentId);
    if (parentIndex !== -1) {
      const firstBranchChildIndex = currentMessages.findIndex(msg => msg.parentId === branchParentId);
      if (firstBranchChildIndex !== -1) {
          // Get all messages from the first child onwards
          displayedMessages = currentMessages.slice(firstBranchChildIndex);
      } else {
          console.warn("Could not find first child of branch parent, showing empty.");
          displayedMessages = []; 
      }
    } else {
        console.warn("Could not find branch parent in current messages path, showing empty.");
        displayedMessages = [];
    }
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

  // Determine a key for animation based on branch state, not every message change
  const animationKey = branchParentId ? `branch-${branchParentId}` : 'main';

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      <header className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 shrink-0 relative">
        {/* Left Side: Show logo title */}
        {/* Back button moved to main content area */}
        {!branchParentId && (
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">SuperGrok</h1>
          </div>
        )}

        {/* Center Content: Empty */}

        {/* Right Side: Auth Controls (always show unless back button logic changes this) */}
        {/* Currently shows when not in branch view - this seems correct */}
        {!branchParentId && (
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
          key={animationKey}
          className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col space-y-0 w-full max-w-4xl mx-auto relative" // Added relative
          variants={animationVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Moved Back Button Here */}
          {branchParentId && (
            <button
              onClick={handleGoBack}
              // Positioned top-left within the main scrollable area
              className="absolute top-2 left-2 z-10 p-2 rounded-md text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 shadow hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-blue-500 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-label="Go back"
              title="Go back"
            >
              <FiArrowLeft className="h-5 w-5" />
            </button>
          )}

          {/* Moved "Based off of" text inside main area */}
          {branchParentId && (
            // Added padding-top to prevent overlap with absolute back button
            <div className="text-sm italic text-gray-500 dark:text-gray-400 text-center mb-4 pt-10 flex-shrink-0">
              Based off of: "{branchSourceText}"
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
