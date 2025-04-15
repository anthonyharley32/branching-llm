'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction, useCallback } from 'react';
// Assuming types are defined here - adjust path if needed
import { Conversation, MessageNode } from '../types/conversation'; 
import { v4 as uuidv4 } from 'uuid'; // Need uuid for generating IDs
import { useAuth } from './AuthContext'; // Import useAuth hook

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
const LOCAL_STORAGE_CONVERSATION_KEY = 'LearningLLM_conversation';
const LOCAL_STORAGE_ACTIVE_ID_KEY = 'LearningLLM_activeMessageId';

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

  // Load state from local storage or initialize based on auth state
  useEffect(() => {
    setIsLoading(true);
    // Wait until auth state is determined
    if (isAuthLoading) {
      return; 
    }

    if (session) {
      // --- USER IS LOGGED IN --- 
      console.log('User logged in, attempting to load conversation from localStorage');
      try {
        const storedConversation = localStorage.getItem(LOCAL_STORAGE_CONVERSATION_KEY);
        if (storedConversation) {
          const parsedConversation = JSON.parse(storedConversation) as Conversation;
          if (parsedConversation && typeof parsedConversation === 'object' && parsedConversation.messages) {
            setConversation(parsedConversation);
            console.log('Loaded conversation for user');
            const storedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
            if (storedActiveId && parsedConversation.messages[storedActiveId]) {
              setActiveMessageId(storedActiveId);
              console.log('Loaded activeMessageId for user');
            } else if (parsedConversation.rootMessageId) {
              setActiveMessageId(parsedConversation.rootMessageId);
            }
          } else {
            console.warn('Invalid conversation data in localStorage for user, initializing new.');
            localStorage.removeItem(LOCAL_STORAGE_CONVERSATION_KEY);
            localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
            initializeNewConversation(); // Initialize fresh
          }
        } else {
          console.log('No conversation found in localStorage for user, initializing new.');
          initializeNewConversation(); // Initialize fresh
        }
      } catch (error) {
        console.error('Error loading from localStorage for user:', error);
        localStorage.removeItem(LOCAL_STORAGE_CONVERSATION_KEY);
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
        initializeNewConversation(); // Initialize fresh on error
      }
    } else {
      // --- USER IS GUEST --- 
      console.log('User is guest, initializing new in-memory conversation.');
      // Ensure localStorage is clear for guest state (in case of logout)
      localStorage.removeItem(LOCAL_STORAGE_CONVERSATION_KEY);
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
      initializeNewConversation(); // Initialize fresh
    }
    setIsLoading(false); // Loading finished
  }, [session, isAuthLoading]); // Rerun when auth state changes

  // Helper to initialize a new conversation
  const initializeNewConversation = () => {
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
    console.log('Initialized new conversation object');
  };

  // Save conversation state to local storage ONLY if logged in
  useEffect(() => {
    if (!isLoading && session && conversation) { // Check for session
      try {
        console.log('Saving conversation to localStorage for logged-in user');
        localStorage.setItem(LOCAL_STORAGE_CONVERSATION_KEY, JSON.stringify(conversation));
      } catch (error) {
        console.error('Error saving conversation to localStorage:', error);
      }
    }
  }, [conversation, isLoading, session]); // Add session dependency

  // Save active message ID ONLY if logged in
  useEffect(() => {
    if (!isLoading && session && activeMessageId) { // Check for session
      try {
        console.log('Saving activeMessageId to localStorage for logged-in user');
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, activeMessageId);
      } catch (error) {
        console.error('Error saving activeMessageId to localStorage:', error);
      }
    } else if (!isLoading && session && activeMessageId === null) {
      // Remove if user is logged in and ID becomes null
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
    }
    // No need to handle removal for guests, as it's done during initialization
  }, [activeMessageId, isLoading, session]); // Add session dependency

  // Derive current messages (path) whenever the conversation map or active message changes
  useEffect(() => {
    if (conversation?.messages && activeMessageId) {
      const path = getPathToNode(conversation.messages, activeMessageId);
      setCurrentMessages(path);
      // Example: Update children state if needed
      // const children = getChildrenOfNode(conversation.messages, activeMessageId);
      // setCurrentBranchNodes(children);
    } else {
      setCurrentMessages([]);
      // setCurrentBranchNodes([]);
    }
  }, [conversation, activeMessageId]);

  // --- Helper function to check for children --- 
  const hasChildren = useCallback((messageId: string): boolean => {
    if (!conversation?.messages) return false;
    // Check if any message in the map has this messageId as its parentId
    return Object.values(conversation.messages).some(msg => msg.parentId === messageId);
  }, [conversation]); // Dependency on the conversation map

  // --- Function to update content of an existing message (for streaming) ---
  const updateMessageContent = useCallback((messageId: string, contentChunk: string) => {
    if (isLoading) {
      console.warn('Attempted to update message while loading state');
      return;
    }
    setConversation(prevConv => {
      if (!prevConv || !prevConv.messages[messageId]) {
        console.error(`Cannot update message: ID "${messageId}" not found.`);
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
        updatedAt: new Date().getTime(),
      };
    });
  }, [isLoading]); // Dependency on isLoading

  // Updated addMessage to return the new node and its historical path
  const addMessage = useCallback((messageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'>, parentIdParam?: string | null): AddMessageResult | null => {
    if (isLoading) {
      console.warn('Attempted to add message while loading state');
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
        console.error(`Cannot add message: Parent ID "${effectiveParentId}" not found.`);
        return null; // Return null early if parent not found
      }
      finalNode = { ...messageData, id: newId, parentId: effectiveParentId, createdAt: now };
      potentialMessagesMap = { ...conversation.messages, [newId]: finalNode }; // Map for path calculation
      finalPath = getPathToNode(potentialMessagesMap, newId);
    }

    // Check if finalNode was successfully created before proceeding
    if (!finalNode) {
      console.error('Failed to create finalNode before setting state');
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
        console.warn('Cannot create branch: context not ready or conversation missing.');
        return null;
    }
    if (!conversation.messages[sourceMessageId]) {
        console.error(`Cannot create branch: Source message ID "${sourceMessageId}" not found.`);
        return null;
    }
    console.log(`Creating branch from message ${sourceMessageId} with text: "${selectedText}"`);

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
      console.log(`Branch created. New active node: ${addResult.newNode.id}. Path length: ${addResult.messagePath.length}. Branch ID: ${branchId}`);
      return addResult;
    } else {
      console.error('Failed to add the branching message.');
      return null;
    }
  }, [conversation, addMessage, isLoading]);

  // Re-add the selectBranch function definition
  const selectBranch = useCallback((messageId: string) => {
    if (conversation?.messages && conversation.messages[messageId]) {
      console.log("Selecting branch/message:", messageId);
      setActiveMessageId(messageId);
    } else {
      console.warn(`selectBranch: Message ID ${messageId} not found.`);
    }
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