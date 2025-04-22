'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction, useCallback, useRef } from 'react';
// Assuming types are defined here - adjust path if needed
import { Conversation, MessageNode } from '../types/conversation'; 
import { v4 as uuidv4 } from 'uuid'; // Need uuid for generating IDs
import { useAuth } from './AuthContext'; // Import useAuth hook
// Import Supabase service functions
import { loadConversationFromSupabase, saveConversationToSupabase } from '../services/conversationService'; 
import { supabase } from '../lib/supabase';

// --- Helper Functions (adapted for flat structure) ---

// Function to find the path from root to a target node ID by walking up parent links
const getPathToNode = (messages: Record<string, MessageNode>, targetId: string | null): MessageNode[] => {
  if (!targetId || !messages[targetId]) {
    return [];
  }

  const path: MessageNode[] = [];
  let currentId: string | null = targetId;

  while (currentId && messages[currentId]) {
    path.push(messages[currentId]);
    currentId = messages[currentId].parentId;
  }

  return path.reverse(); // Reverse to get root-to-target order
};

// Function to get all direct children of a node
const getChildrenOfNode = (messages: Record<string, MessageNode>, parentId: string | null): MessageNode[] => {
    if (!parentId) return []; // Or handle root case differently if needed
    return Object.values(messages).filter(msg => msg.parentId === parentId);
};

// --- End Helper Functions ---

// --- Constants for local storage ---
const LOCAL_STORAGE_CONVERSATION_KEY = 'LearningLLM_conversation'; // Keep for potential migration or backup? Decided against using for logged-in users.
const LOCAL_STORAGE_ACTIVE_ID_KEY = 'LearningLLM_activeMessageId'; // Keep for potential migration or backup? Decided against using for logged-in users.
const GUEST_LOCAL_STORAGE_CONVERSATION_KEY = 'LearningLLM_guest_conversation'; // New key for guests
const GUEST_LOCAL_STORAGE_ACTIVE_ID_KEY = 'LearningLLM_guest_activeMessageId'; // New key for guests

// Type for the return value of addMessage, including the path for the API call
export interface AddMessageResult {
  newNode: MessageNode;
  messagePath: MessageNode[];
}

// Define the shape of the context data
interface ConversationContextType {
  conversation: Conversation | null;
  setConversation: Dispatch<SetStateAction<Conversation | null>>;
  activeMessageId: string | null;
  setActiveMessageId: Dispatch<SetStateAction<string | null>>;
  currentMessages: MessageNode[]; // Path from root to active node
  currentBranchNodes: MessageNode[]; // Children of the active node + the active node itself? Or just children? Let's start with path.
  addMessage: (messageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'>, parentId?: string | null) => AddMessageResult | null;
  selectBranch: (messageId: string) => void;
  createBranch: (sourceMessageId: string, selectedText: string, selectionStart?: number, selectionEnd?: number) => AddMessageResult | null;
  hasChildren: (messageId: string) => boolean;
  updateMessageContent: (messageId: string, contentChunk: string) => void;
  startNewConversation: () => void;
  updateConversationTitle: (conversationId: string, title: string) => void;
  startEditingMessage: (messageId: string) => void;
  saveEditedMessage: (messageId: string, newContent: string) => Promise<boolean>;
  cancelEditingMessage: () => void;
}

// Create the context with a default value
const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

// Create the provider component
interface ConversationProviderProps {
  children: ReactNode;
}

export const ConversationProvider: React.FC<ConversationProviderProps> = ({ children }: ConversationProviderProps) => {
  const { session, isLoading: isAuthLoading } = useAuth(); // Get auth state

  // Initialize state - Always start null/empty, loading logic is in useEffect
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = useState<MessageNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Internal loading state for context
  const [isSaving, setIsSaving] = useState<boolean>(false); // Add saving state

  // Debounced save function reference using useRef to persist across renders
  const debouncedSaveRef = useRef(debounce(saveConversationToSupabase, 1500));

  // Helper function to find the latest message ID in the main thread
  const findLatestMessageId = (messages: Record<string, MessageNode>, rootId: string | null): string | null => {
    if (!rootId || !messages[rootId]) return rootId; // Return root if invalid

    let latestId = rootId;
    let latestTimestamp = messages[rootId].createdAt.getTime();
    let currentId: string | null = rootId;

    while (currentId) {
      const children = Object.values(messages)
        .filter(msg => 
          msg.parentId === currentId && 
          !(msg.metadata?.isBranchStart === true) // Exclude branch starts
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort descending by time

      if (children.length === 0) {
        break; // No more children in the main thread
      }

      // The latest child is the next step in the main thread
      const nextNode = children[0];
      if (nextNode.createdAt.getTime() >= latestTimestamp) {
        latestId = nextNode.id;
        latestTimestamp = nextNode.createdAt.getTime();
      }
      currentId = nextNode.id;
    }
    
    return latestId;
  };

  // Load state from local storage or initialize based on auth state
  useEffect(() => {
    const loadState = async () => {
      setIsLoading(true);
      // Wait until auth state is determined
      if (isAuthLoading) {
        return; 
      }

      // Always initialize a fresh conversation when the app loads
      // This will give users a blank chat experience on first load
      initializeNewConversation(session?.user?.id);

      // For logged-in users, still load their conversations for the sidebar
      // but don't display them automatically in the chat area
      if (session) {
        // Clear any old guest data
        localStorage.removeItem(GUEST_LOCAL_STORAGE_CONVERSATION_KEY);
        localStorage.removeItem(GUEST_LOCAL_STORAGE_ACTIVE_ID_KEY);

        // We load conversations for the sidebar but don't set them active
        // The ChatHistory component will handle displaying these in the sidebar
      } else {
        // --- USER IS GUEST --- 
        // Clear any potential logged-in user data (e.g., if they logged out)
        localStorage.removeItem(LOCAL_STORAGE_CONVERSATION_KEY); 
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
        
        // For guests, we can still keep the local storage clean
        try {
          const storedConversation = localStorage.getItem(GUEST_LOCAL_STORAGE_CONVERSATION_KEY);
          if (!storedConversation) {
            // If no stored conversation, we already initialized a new one above
          } else {
            // We still want to clean up any invalid data
            try {
              JSON.parse(storedConversation);
            } catch (error) {
              localStorage.removeItem(GUEST_LOCAL_STORAGE_CONVERSATION_KEY);
              localStorage.removeItem(GUEST_LOCAL_STORAGE_ACTIVE_ID_KEY);
            }
          }
        } catch (error) {
          localStorage.removeItem(GUEST_LOCAL_STORAGE_CONVERSATION_KEY);
          localStorage.removeItem(GUEST_LOCAL_STORAGE_ACTIVE_ID_KEY);
        }
      }
      setIsLoading(false); // Loading finished
    };

    loadState();
  }, [session, isAuthLoading]);

  // Helper to initialize a new conversation, now accepts optional userId
  const initializeNewConversation = (userId?: string) => {
    const rootId = uuidv4();
    const initialMessage: MessageNode = {
      id: rootId,
      role: 'system',
      content: '', // Empty content instead of "Conversation started."
      createdAt: new Date(),
      parentId: null,
    };
    const newConv: Conversation = {
      id: uuidv4(),
      rootMessageId: rootId,
      messages: { [rootId]: initialMessage },
      createdAt: new Date().getTime(),
    };
    setConversation(newConv);
    setActiveMessageId(rootId);
  };

  // Function to start a new conversation
  const startNewConversation = () => {
    initializeNewConversation(session?.user?.id); // Pass user ID if logged in
    // Persisting the *new* conversation will be handled by the useEffect that watches `conversation`
  };

  // NEW: Save conversation state based on auth status
  useEffect(() => {
    if (!isLoading && conversation) {
      // Only save if the conversation has changed content-wise
      // Check for specific content-changing actions rather than any viewing
      if (conversation._hasContentChanges) {
        if (session) {
          // --- USER IS LOGGED IN --- 
          // Ensure userId is attached before saving and retain title if it exists
          const convWithUser = { 
            ...conversation, 
            userId: session.user.id,
            updatedAt: new Date().getTime() // Only update timestamp when content has changed
          }; 
          debouncedSaveRef.current.debounced(convWithUser);
          
          // Reset the flag after saving
          setConversation(prev => prev ? { ...prev, _hasContentChanges: false } : prev);
        } else {
          // --- USER IS GUEST --- 
          try {
            localStorage.setItem(GUEST_LOCAL_STORAGE_CONVERSATION_KEY, JSON.stringify(conversation));
          } catch (error) {
             console.error("Error saving guest conversation to localStorage:", error);
          }
        }
      }
    }
  }, [conversation, isLoading, session, debouncedSaveRef]);

  // NEW: Save active message ID for guests
  useEffect(() => {
    if (!isLoading && !session) { // Only for guests
      if (activeMessageId) {
        try {
          localStorage.setItem(GUEST_LOCAL_STORAGE_ACTIVE_ID_KEY, activeMessageId);
        } catch (error) {
          console.error("Error saving guest activeMessageId to localStorage:", error);
        }
      } else {
        localStorage.removeItem(GUEST_LOCAL_STORAGE_ACTIVE_ID_KEY); // Remove if null
      }
    }
    // Note: Persistence for logged-in activeMessageId is TBD (maybe via Supabase metadata)
  }, [activeMessageId, isLoading, session]);

  // Derive current messages (path) whenever the conversation map or active message changes
  useEffect(() => {
    if (conversation?.messages && activeMessageId) {
      const path = getPathToNode(conversation.messages, activeMessageId);
      setCurrentMessages(path);
    } else {
      setCurrentMessages([]);
    }
    // Add conversation.id to dependencies to ensure effect runs when conversation changes entirely
  }, [conversation?.id, conversation?.messages, activeMessageId]);

  // --- Helper function to check for children --- 
  const hasChildren = useCallback((messageId: string): boolean => {
    if (!conversation?.messages) return false;
    // Check if any message in the map has this messageId as its parentId
    return Object.values(conversation.messages).some(msg => msg.parentId === messageId);
  }, [conversation]); // Dependency on the conversation map

  // --- Function to update content of an existing message (for streaming) ---
  const updateMessageContent = useCallback((messageId: string, contentChunk: string) => {
    if (isLoading) {
      return;
    }
    setConversation(prevConv => {
      if (!prevConv || !prevConv.messages[messageId]) {
        return prevConv; // Return previous state if ID not found
      }

      const updatedMessage = {
        ...prevConv.messages[messageId],
        content: prevConv.messages[messageId].content + contentChunk, // Append chunk
      };

      return {
        ...prevConv,
        messages: {
          ...prevConv.messages,
          [messageId]: updatedMessage,
        },
        _hasContentChanges: true, // Mark that content has changed
      };
    });
  }, [isLoading]); // Dependency on isLoading

  // Updated addMessage to return the new node and its historical path
  const addMessage = useCallback((messageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'>, parentIdParam?: string | null): AddMessageResult | null => {
    if (isLoading) {
      return null;
    }
    const newId = uuidv4();
    const now = new Date();

    let finalNode: MessageNode | null = null;
    let finalPath: MessageNode[] = [];

    // --- Determine the node and path BEFORE setting state ---
    let effectiveParentId: string | null;
    let potentialMessagesMap: Record<string, MessageNode>;

    if (!conversation) { // Check if conversation exists before creating the node
      effectiveParentId = null;
      finalNode = { ...messageData, id: newId, parentId: effectiveParentId, createdAt: now };
      potentialMessagesMap = { [newId]: finalNode }; // Map for path calculation
      finalPath = [finalNode];
    } else {
      effectiveParentId = parentIdParam === undefined ? activeMessageId : parentIdParam;
      if (effectiveParentId !== null && !conversation.messages[effectiveParentId]) {
        return null; // Return null early if parent not found
      }
      finalNode = { ...messageData, id: newId, parentId: effectiveParentId, createdAt: now };
      potentialMessagesMap = { ...conversation.messages, [newId]: finalNode }; // Map for path calculation
      finalPath = getPathToNode(potentialMessagesMap, newId);
    }

    // Check if finalNode was successfully created before proceeding
    if (!finalNode) {
      return null;
    }

    // --- Now update the state --- 
    setConversation(prevConv => {
      let updatedConv: Conversation;

      if (!prevConv) {
        updatedConv = {
          id: uuidv4(),
          rootMessageId: newId,
          messages: { [newId]: finalNode! }, // Use the pre-calculated finalNode
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
          _hasContentChanges: true // Mark that content has changed
        };
        setActiveMessageId(newId);
      } else {
        updatedConv = {
          ...prevConv,
          messages: {
            ...prevConv.messages,
            [newId]: finalNode!, // Use the pre-calculated finalNode
          },
          updatedAt: now.getTime(),
          _hasContentChanges: true // Mark that content has changed
        };
        setActiveMessageId(newId);
      }
      return updatedConv;
    });

    // Return the pre-calculated node and path
    // (The check for finalNode validity happened before setConversation)
    return { newNode: finalNode, messagePath: finalPath };

  }, [activeMessageId, isLoading, conversation]); // Add conversation as dependency

  // Updated createBranch to align with MessageNode using createdAt
  const createBranch = useCallback((
    sourceMessageId: string, 
    selectedText: string,
    selectionStart?: number,
    selectionEnd?: number
  ): AddMessageResult | null => {
     if (isLoading || !conversation) {
        return null;
    }
    if (!conversation.messages[sourceMessageId]) {
        return null;
    }

    // Set the flag to indicate content changes
    setConversation(prev => prev ? { ...prev, _hasContentChanges: true } : prev);

    // Generate a unique branch ID
    const branchId = `branch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const userNode: MessageNode = conversation.messages[sourceMessageId];

    // 2. Create the initial AI response node as a child of the user node
    const aiNode: MessageNode = {
      id: uuidv4(),
      role: 'assistant',
      content: '', // Set to empty string - subsequent LLM call should populate this
      parentId: userNode.id,
      createdAt: new Date(),
      metadata: {
        branchId: branchId,  // Add branch ID to message metadata
        selectedText: selectedText,
        selectionStart: selectionStart !== undefined ? selectionStart : null,
        selectionEnd: selectionEnd !== undefined ? selectionEnd : null,
        isBranchStart: true
      }
    };

    // Add the new AI node as a child of the *source* message (the one branched from)
    const addResult = addMessage(aiNode, sourceMessageId);

    if (addResult) {
      return addResult;
    } else {
      return null;
    }
  }, [conversation, addMessage, isLoading]);

  // Re-add the selectBranch function definition
  const selectBranch = useCallback((messageId: string) => {
    if (conversation?.messages && conversation.messages[messageId]) {
      setActiveMessageId(messageId);
    }
  }, [conversation]);

  // --- Function to update conversation title --- 
  const updateConversationTitle = useCallback(async (conversationId: string, title: string) => {
    if (!conversationId) return;

    setConversation(prev => {
      if (prev && prev.id === conversationId) {
        // Create a new object with the updated title and timestamp
        return {
          ...prev,
          title: title,
          updatedAt: new Date().getTime(), // Also update timestamp
          _hasContentChanges: true // Mark that content has changed to trigger database save
        };
      }
      return prev;
    });

    // 2. Update database in the background
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ title: title, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (error) {
        console.error('Error updating conversation title in database:', error);
        // TODO: Consider reverting local state or showing an error to the user
      }
    } catch (dbError) {
      console.error('Unexpected error saving title to DB:', dbError);
    }
  }, []); // No dependencies needed as it operates on passed IDs/values

  // --- Function to start editing a message ---
  const startEditingMessage = useCallback((messageId: string) => {
    if (!conversation?.messages[messageId]) return;
    
    // Only user messages can be edited
    if (conversation.messages[messageId].role !== 'user') return;
    
    setConversation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        editingMessageId: messageId
      };
    });
  }, [conversation]);

  // --- Function to cancel editing a message ---
  const cancelEditingMessage = useCallback(() => {
    setConversation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        editingMessageId: null
      };
    });
  }, []);

  // --- Function to save an edited message and regenerate AI responses ---
  const saveEditedMessage = useCallback(async (messageId: string, newContent: string): Promise<boolean> => {
    if (!conversation?.messages[messageId]) return false;
    if (conversation.messages[messageId].role !== 'user') return false;
    
    // Get the message being edited
    const editedMessage = conversation.messages[messageId];
    
    // Get all responses after this message that need to be deleted
    const responsesToDelete = new Set<string>();
    let currentId = messageId;
    
    // Find all assistant messages that directly follow this message
    // (we'll need to regenerate these)
    const collectResponsesToDelete = (id: string) => {
      const children = getChildrenOfNode(conversation.messages, id);
      
      for (const child of children) {
        // Skip branch starts (those with selectedText in metadata)
        if (child.metadata?.selectedText) continue;
        
        responsesToDelete.add(child.id);
        
        // Recursively collect responses from this child
        if (child.role === 'assistant') {
          collectResponsesToDelete(child.id);
        }
      }
    };
    
    collectResponsesToDelete(messageId);
    
    // Update the message content
    setConversation(prev => {
      if (!prev) return prev;
      
      // Create new messages object without the deleted responses
      const updatedMessages = { ...prev.messages };
      
      // Update the edited message
      updatedMessages[messageId] = {
        ...updatedMessages[messageId],
        content: newContent
      };
      
      // Remove all the responses that need to be deleted
      for (const id of responsesToDelete) {
        delete updatedMessages[id];
      }
      
      return {
        ...prev,
        messages: updatedMessages,
        editingMessageId: null, // Exit editing mode
        _hasContentChanges: true, // Mark that content has changed
        _justEdited: true // Flag that message was just edited
      };
    });
    
    // Set the edited message as active 
    setActiveMessageId(messageId);
    
    return true;
  }, [conversation]);

  // Render children only after loading is complete
  if (isLoading || isAuthLoading) {
      // Return null or loading indicator while waiting for auth and initial conversation setup
      return null; 
  }

  // Adjust context value shape
  const contextValue: ConversationContextType = {
    conversation,
    setConversation,
    activeMessageId,
    setActiveMessageId,
    currentMessages,
    currentBranchNodes: [], // Placeholder, remove if not using separate state for children
    addMessage,
    selectBranch,
    createBranch,
    hasChildren,
    updateMessageContent,
    startNewConversation,
    updateConversationTitle,
    startEditingMessage,
    saveEditedMessage,
    cancelEditingMessage,
  };

  return (
    <ConversationContext.Provider value={contextValue}>
      {children}
    </ConversationContext.Provider>
  );
};

// Create a custom hook for easy context consumption
export const useConversation = (): ConversationContextType => {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
};

// Utility debounce function - MODIFIED
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, waitFor);
  };

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  // Return object with debounced function and cancel method
  return { debounced, cancel };
} 