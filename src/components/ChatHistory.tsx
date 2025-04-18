import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useConversation } from '../context/ConversationContext';
import { Conversation as DbConversation, ConversationMessage as DbMessage } from '../types/database';
import { MessageNode } from '../types/conversation';
import { FiEdit } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';

interface HistoryItem {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatHistoryProps {
  onClose: () => void;
  onLoadConversation?: () => void;
  activeConversationId?: string | null;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ onClose, onLoadConversation, activeConversationId }) => {
  const { session } = useAuth();
  const { 
    setConversation, 
    setActiveMessageId, 
    startNewConversation, 
    conversation
  } = useConversation();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingConversation, setLoadingConversation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extract fetchHistory to be reusable and memoize it with useCallback
  const fetchHistory = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('conversations')
      .select('id, title, updated_at')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false });
    if (fetchError) {
      setError('Failed to load history.');
    } else if (data) {
      setHistory(
        data.map(conv => ({ id: conv.id, title: conv.title || 'Untitled', updatedAt: conv.updated_at }))
      );
    }
    setLoading(false);
  }, [session, setLoading, setError, setHistory]);

  useEffect(() => {
    fetchHistory();
  }, [session, fetchHistory]);

  // Add another useEffect to refresh history when conversation ID changes (new conversation created)
  // AND optimistically add the new conversation if it's not already present
  useEffect(() => {
    if (conversation?.id && conversation.rootMessageId) { // Check for ID and rootMessageId
      // Check if this conversation ID is already in our history list
      const existsInHistory = history.some(item => item.id === conversation.id);
      
      // If it's a *new* conversation (not in the list yet)
      if (!existsInHistory) {
          // Optimistically add the new conversation to the top of the list
          const newHistoryItem: HistoryItem = {
              id: conversation.id,
              title: conversation.title || 'New Chat', // Use current title or default
              // Ensure updatedAt exists and is valid, otherwise use current time
              updatedAt: new Date(conversation.updatedAt || Date.now()).toISOString() 
          };
          // Prepend the new item and re-sort immediately
          setHistory(prevHistory => 
             [newHistoryItem, ...prevHistory]
             .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) 
          );
          // No need to call fetchHistory() immediately after optimistic update, 
          // let the title/update effect handle subsequent refreshes if needed.
      }
      // Removed the direct call to fetchHistory() here to avoid immediate overwrite
      // The background save will eventually happen, and subsequent loads/refreshes will be correct.
    }
  // Watch the core conversation identifiers and fetchHistory function
  }, [conversation?.id, conversation?.rootMessageId, conversation?.title, conversation?.updatedAt, fetchHistory, history]); 
  // Note: Added history to dependency array for checking existsInHistory

  // --- Effect to update the current conversation's title/timestamp in the history list LIVE ---
  useEffect(() => {
    // Only run if we have a valid conversation object loaded
    if (conversation) {
      setHistory(prevHistory => 
        prevHistory.map(item => {
          // If this list item's ID matches the currently loaded conversation's ID...
          if (item.id === conversation.id) {
            // ...update its title and updatedAt timestamp if they differ
            const newTitle = conversation.title || 'New Chat'; 
            const newTimestamp = typeof conversation.updatedAt === 'number' 
              ? new Date(conversation.updatedAt).toISOString() 
              : item.updatedAt; // Fallback to existing timestamp if invalid
            
            const titleChanged = item.title !== newTitle;
            // Compare timestamps more reliably by converting both to Date objects if possible
            let timestampChanged = false;
            try {
              const itemDate = new Date(item.updatedAt).getTime();
              const convDate = new Date(newTimestamp).getTime();
              // Only compare if both are valid dates
              if (!isNaN(itemDate) && !isNaN(convDate)) {
                timestampChanged = itemDate !== convDate;
              }
            } catch (e) {
              // Handle potential invalid date strings gracefully
              timestampChanged = item.updatedAt !== newTimestamp;
            }

            if (titleChanged || timestampChanged) {
              return { ...item, title: newTitle, updatedAt: newTimestamp };
            }
          }
          // Otherwise, return the item unchanged
          return item;
        })
        // Sort history after potential updates to ensure correct order
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
    }
  // Watch for changes in the active conversation's ID, title, or timestamp
  // Using conversation.id ensures this runs whenever the conversation context changes
  }, [conversation?.id, conversation?.title, conversation?.updatedAt]);

  // Add a helper function to find the latest message ID in the main thread
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

  const loadConversation = async (convId: string) => {
    if (!session) return;
    
    // Track which conversation is loading without showing loading UI immediately
    setLoadingConversation(convId);
    
    // Don't show loading state immediately, only if operation takes longer than expected
    let showLoadingTimeout: NodeJS.Timeout | null = setTimeout(() => {
      setLoading(true);
    }, 300); // Short delay before showing loading indicator
    
    try {
      // 1. Fetch conversation metadata
      const { data: meta, error: metaError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', convId)
        .single();
        
      if (metaError || !meta) {
        setError('Failed to load conversation.');
        return;
      }
      
      // 2. Fetch all messages for the conversation
      const { data: msgs, error: msgsError } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', convId);
        
      if (msgsError || !msgs) {
        setError('Failed to load conversation messages.');
        return;
      }
      
      // 3. Build the message tree
      const messagesMap: Record<string, MessageNode> = {};
      msgs.forEach(dbMsg => {
        messagesMap[dbMsg.id] = {
          id: dbMsg.id,
          role: dbMsg.role as 'user' | 'assistant' | 'system',
          content: dbMsg.content,
          createdAt: new Date(dbMsg.created_at),
          parentId: dbMsg.parent_message_id,
          metadata: dbMsg.metadata || {},
        };
      });
      
      // 4. Set the conversation state
      const conversationData = {
        id: meta.id,
        rootMessageId: meta.root_message_id,
        messages: messagesMap,
        createdAt: new Date(meta.created_at).getTime(),
        updatedAt: new Date(meta.updated_at).getTime(),
        userId: session.user.id,
        title: meta.title || undefined,
        _hasContentChanges: false, // Explicitly set to false when loading to prevent timestamp updates
      };
      console.log(`[ChatHistory] Setting conversation context with data:`, conversationData);
      setConversation(conversationData);
      
      // 5. Find the ID of the LATEST message in the main thread
      const latestMessageId = findLatestMessageId(messagesMap, meta.root_message_id);
      
      // 6. Set the active message ID to the LATEST message
      // This is crucial for displaying the conversation correctly
      if (latestMessageId) {
        setActiveMessageId(latestMessageId);
        console.log(`Loading conversation: ${meta.id} (Latest message: ${latestMessageId})`);
      } else {
         // Fallback if latest couldn't be found (shouldn't usually happen if root exists)
         setActiveMessageId(meta.root_message_id);
         console.log(`Loading conversation: ${meta.id} (Root message: ${meta.root_message_id})`);
      }
      
      // 7. Reset branch stack if provided
      if (onLoadConversation) {
        onLoadConversation();
      }
    } catch (error) {
      setError('An unexpected error occurred.');
    } finally {
      // Clear the loading timeout if it hasn't fired yet
      if (showLoadingTimeout) {
        clearTimeout(showLoadingTimeout);
        showLoadingTimeout = null;
      }
      setLoading(false);
      setLoadingConversation(null);
    }
  };

  const handleNewChat = () => {
    startNewConversation();
    // Refresh history after creating a new conversation
    fetchHistory();
  };

  return (
    <div className="h-full w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Chat History</h2>
          <button onClick={onClose} className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100">✕</button>
        </div>
      </div>
      
      <button 
        onClick={handleNewChat}
        className="flex items-center justify-center gap-2 w-full py-2 px-3 mb-6 text-sm font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <FiEdit className="h-4 w-4" />
        <span>New Conversation</span>
      </button>
      
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Recent conversations</div>
      
      {/* Only show loading when there's no history content yet */}
      {loading && history.length === 0 && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      
      {/* Always show history list if it exists, even during subsequent loads */}
      {history.length > 0 ? (
        <ul className="list-none p-0 m-0">
          {history.map(item => (
            <li key={item.id} className="mb-2 list-none">
              <button
                onClick={() => loadConversation(item.id)}
                disabled={loadingConversation === item.id}
                className={`w-full text-left px-2 py-2 rounded transition-colors duration-150 ease-in-out ${ 
                  item.id === activeConversationId 
                    ? 'bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${loadingConversation === item.id ? 'opacity-70' : ''}`}
              >
                <div className="font-medium text-gray-900 dark:text-gray-200 flex items-center">
                  {item.title}
                  {loadingConversation === item.id && (
                    <span className="ml-2 inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</div>
              </button>
            </li>
          ))}
        </ul>
      ) : !loading && !error ? (
        <p className="text-gray-500">No conversations found.</p>
      ) : null}
    </div>
  );
};

export default ChatHistory; 