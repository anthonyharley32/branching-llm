'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction, useCallback } from 'react';
// Assuming types are defined here - adjust path if needed
import { Conversation, MessageNode } from '../types/conversation'; 
import { v4 as uuidv4 } from 'uuid'; // Need uuid for generating IDs

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

const LOCAL_STORAGE_CONVERSATION_KEY = 'supergrok_conversation';
const LOCAL_STORAGE_ACTIVE_ID_KEY = 'supergrok_activeMessageId';

// Type for the return value of addMessage, including the path for the API call
interface AddMessageResult {
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
  createBranch: (sourceMessageId: string, selectedText: string) => AddMessageResult | null;
}

// Create the context with a default value
const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

// Create the provider component
interface ConversationProviderProps {
  children: ReactNode;
}

export const ConversationProvider: React.FC<ConversationProviderProps> = ({ children }: ConversationProviderProps) => {
  // Initialize state potentially from local storage
  const [conversation, setConversation] = useState<Conversation | null>(() => {
    // Removed direct loading here, will use useEffect hook
    return null; 
  });
  const [activeMessageId, setActiveMessageId] = useState<string | null>(() => {
    // Removed direct loading here, will use useEffect hook
    return null;
  });
  const [currentMessages, setCurrentMessages] = useState<MessageNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Add loading state

  // Load state from local storage on initial mount
  useEffect(() => {
    try {
      const storedConversation = localStorage.getItem(LOCAL_STORAGE_CONVERSATION_KEY);
      if (storedConversation) {
        const parsedConversation = JSON.parse(storedConversation) as Conversation;
        // Basic validation - could be more robust (e.g., with zod)
        if (parsedConversation && typeof parsedConversation === 'object' && parsedConversation.messages) {
            setConversation(parsedConversation);
            console.log('Loaded conversation from localStorage');

            const storedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
            if (storedActiveId && parsedConversation.messages[storedActiveId]) {
                setActiveMessageId(storedActiveId);
                console.log('Loaded activeMessageId from localStorage');
            } else if (parsedConversation.rootMessageId) {
                // Default to root if active ID is invalid or not found
                setActiveMessageId(parsedConversation.rootMessageId);
            }
        } else {
            console.warn('Invalid conversation data found in localStorage');
            localStorage.removeItem(LOCAL_STORAGE_CONVERSATION_KEY);
            localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
        }
      } else {
          console.log('No conversation found in localStorage');
          // Initialize a new empty conversation if none exists
          const rootId = uuidv4();
          const initialMessage: MessageNode = {
            id: rootId,
            role: 'system', // Or a default user message?
            content: 'Conversation started.', // Placeholder
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
          console.log('Initialized new conversation');
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      // Clear potentially corrupted data
      localStorage.removeItem(LOCAL_STORAGE_CONVERSATION_KEY);
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
    }
    setIsLoading(false); // Loading finished
  }, []); // Empty dependency array ensures this runs only once on mount

  // Save conversation state to local storage whenever it changes
  useEffect(() => {
    if (!isLoading && conversation) { // Only save after initial load is complete
        try {
            console.log('Saving conversation to localStorage');
            localStorage.setItem(LOCAL_STORAGE_CONVERSATION_KEY, JSON.stringify(conversation));
        } catch (error) {
            console.error('Error saving conversation to localStorage:', error);
        }
    }
  }, [conversation, isLoading]);

  // Save active message ID whenever it changes
  useEffect(() => {
    if (!isLoading && activeMessageId) { // Only save after initial load
        try {
            console.log('Saving activeMessageId to localStorage');
            localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, activeMessageId);
        } catch (error) {
            console.error('Error saving activeMessageId to localStorage:', error);
        }
    } else if (!isLoading && activeMessageId === null) {
        // Explicitly remove if activeMessageId is set to null (e.g., conversation cleared)
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
    }
  }, [activeMessageId, isLoading]);

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

    setConversation(prevConv => {
      let updatedConv: Conversation;
      let effectiveParentId: string | null;

      if (!prevConv) {
        // Create first message and new conversation
        effectiveParentId = null;
        finalNode = {
          ...messageData,
          id: newId,
          parentId: effectiveParentId,
          createdAt: now,
        };
        updatedConv = {
          id: uuidv4(),
          rootMessageId: newId,
          messages: { [newId]: finalNode },
          createdAt: now.getTime(),
        };
        finalPath = [finalNode];
        setActiveMessageId(newId);
      } else {
        // Add to existing conversation
        effectiveParentId = parentIdParam === undefined ? activeMessageId : parentIdParam;
        if (effectiveParentId !== null && !prevConv.messages[effectiveParentId]) {
          console.error(`Cannot add message: Parent ID "${effectiveParentId}" not found.`);
          return prevConv;
        }
        finalNode = {
          ...messageData,
          id: newId,
          parentId: effectiveParentId,
          createdAt: now,
        };
        updatedConv = {
          ...prevConv,
          messages: {
            ...prevConv.messages,
            [newId]: finalNode,
          },
          updatedAt: now.getTime(),
        };
        finalPath = getPathToNode(updatedConv.messages, newId);
        setActiveMessageId(newId);
      }
      return updatedConv;
    });

    if (finalNode) {
      return { newNode: finalNode, messagePath: finalPath };
    } else {
      console.error('Failed to obtain finalNode after state update in addMessage');
      return null;
    }
  }, [activeMessageId, isLoading]);

  // Updated createBranch to align with MessageNode using createdAt
  const createBranch = useCallback((sourceMessageId: string, selectedText: string): AddMessageResult | null => {
     if (isLoading || !conversation) {
        console.warn('Cannot create branch: context not ready or conversation missing.');
        return null;
    }
    if (!conversation.messages[sourceMessageId]) {
        console.error(`Cannot create branch: Source message ID "${sourceMessageId}" not found.`);
        return null;
    }
    console.log(`Creating branch from message ${sourceMessageId} with text: "${selectedText}"`);

    const branchUserMessageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'> = {
      role: 'user',
      content: `Based on your selection: "${selectedText}", please explore this further.`,
    };

    const addResult = addMessage(branchUserMessageData, sourceMessageId);

    if (addResult) {
      console.log(`Branch created. New active node: ${addResult.newNode.id}. Path length: ${addResult.messagePath.length}`);
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
  if (isLoading) {
      // Optionally return a loading indicator component
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