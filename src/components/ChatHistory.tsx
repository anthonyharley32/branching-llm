import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useConversation } from '../context/ConversationContext';
import { Conversation as DbConversation, ConversationMessage as DbMessage } from '../types/database';
import { MessageNode } from '../types/conversation';
import { FiEdit, FiChevronLeft, FiMoreVertical, FiTrash2, FiEdit2 } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion'; // Import framer-motion for animations

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
  // Track if we have an unused new chat
  const [unusedChatId, setUnusedChatId] = useState<string | null>(null);
  // Track animations for removing items
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Track the previous conversation ID to help with cleanup
  const [prevConversationId, setPrevConversationId] = useState<string | null>(null);
  // Track if previous conversation was unused
  const [prevConversationUnused, setPrevConversationUnused] = useState<boolean>(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Reference to the chat history container for calculating positions
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Detect if current conversation is an unused new chat and track previous conversation
  useEffect(() => {
    if (conversation) {
      // Store previous conversation ID before updating it
      if (conversation.id !== prevConversationId) {
        // Save the current conversation ID as previous before updating
        
        // If we're switching away from an unused chat, mark it for potential removal
        if (unusedChatId && unusedChatId === prevConversationId) {
          setPrevConversationUnused(true);
        }
        
        // Update the previous conversation ID
        setPrevConversationId(conversation.id);
      }
      
      // Check if current conversation is unused
      const messagesArray = Object.values(conversation.messages);
      // Consider a chat unused if it has only one message (system) or it has no user messages
      const isUnused = messagesArray.length === 1 || 
                      !messagesArray.some(msg => msg.role === 'user');
      
      if (isUnused) {
        // This is an unused new chat
        setUnusedChatId(conversation.id);
      } else {
        // This is not an unused new chat
        setUnusedChatId(null);
      }
    }
  }, [conversation, prevConversationId, unusedChatId]);

  // Track when user switches from an unused new chat to another conversation
  useEffect(() => {
    // Check for direct switch from unused chat
    if (activeConversationId && unusedChatId && activeConversationId !== unusedChatId) {
      // User switched away from an unused new chat - let's remove it with animation
      removeUnusedChat(unusedChatId);
      setPrevConversationUnused(false);
    }
    // Also check for switch using the previous conversation tracking
    else if (activeConversationId && prevConversationUnused && prevConversationId && 
             activeConversationId !== prevConversationId) {
      // We switched away from an unused previous conversation
      removeUnusedChat(prevConversationId);
      setPrevConversationUnused(false);
    }
  }, [activeConversationId, unusedChatId, prevConversationId, prevConversationUnused, session]);

  // Helper function to remove an unused chat
  const removeUnusedChat = (chatId: string) => {
    setRemovingId(chatId);
    
    // After animation completes, actually remove from history and database
    setTimeout(async () => {
      // Remove from UI
      setHistory(prevHistory => prevHistory.filter(item => item.id !== chatId));
      
      // Remove from database if user is logged in
      if (session) {
        try {
          await supabase
            .from('conversations')
            .delete()
            .eq('id', chatId);
        } catch (error) {
          console.error('Error deleting unused chat:', error);
        }
      }
      
      setRemovingId(null);
      setUnusedChatId(null);
    }, 500);
  };

  // --- Effect to update the current conversation's title/timestamp in the history list LIVE ---
  useEffect(() => {
    // Wait until initial loading is finished before syncing the current conversation
    if (loading) return; 

    // Only run if we have a valid conversation object loaded
    if (!conversation) return; // Exit early if no conversation

    setHistory(prevHistory => {
      let itemFound = false;
      let needsUpdate = false; // Tracks if any change (title or time) occurred
      let needsSort = false;   // Tracks if sorting is necessary due to time change

      const updatedHistory = prevHistory.map(item => {
        // If this list item's ID matches the currently loaded conversation's ID...
        if (item.id === conversation.id) {
          itemFound = true;
          // ...update its title and updatedAt timestamp if they differ
          const newTitle = conversation.title || 'New Chat';
          // Ensure updatedAt is a valid timestamp string
          const newTimestamp = typeof conversation.updatedAt === 'number'
            ? new Date(conversation.updatedAt).toISOString()
            : item.updatedAt; // Fallback to existing timestamp if invalid

          const titleChanged = item.title !== newTitle;
          let timestampChanged = false;
          try {
            const itemDate = new Date(item.updatedAt).getTime();
            const convDate = new Date(newTimestamp).getTime();
            if (!isNaN(itemDate) && !isNaN(convDate)) {
              timestampChanged = itemDate !== convDate;
              // If timestamp changed AND this item is not already at the top, we might need to re-sort
              // (Assuming list is sorted descending by date)
              if (timestampChanged && prevHistory.length > 0 && prevHistory[0]?.id !== item.id) {
                needsSort = true;
              }
            }
          } catch (e) {
            // Handle potential invalid date strings gracefully
            timestampChanged = item.updatedAt !== newTimestamp;
            // Check again if sorting might be needed
            if (timestampChanged && prevHistory.length > 0 && prevHistory[0]?.id !== item.id) {
               needsSort = true;
            }
          }

          if (titleChanged || timestampChanged) {
            needsUpdate = true; // Mark that an update happened
            return { ...item, title: newTitle, updatedAt: newTimestamp };
          }
        }
        // Otherwise, return the item unchanged
        return item;
      });

      // If the currently active conversation wasn't found in the history list yet,
      // don't modify the list here. Another effect handles adding new items.
      if (!itemFound && conversation && conversation.id && conversation.rootMessageId) {
        // If the current conversation wasn't found, create and add it
        const newHistoryItem: HistoryItem = {
          id: conversation.id,
          title: conversation.title || 'New Chat',
          updatedAt: new Date(conversation.updatedAt || Date.now()).toISOString(),
        };
        // Add the new item and re-sort
        return [newHistoryItem, ...updatedHistory] // Use updatedHistory in case other items were modified
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }

      // Only trigger a state update if an actual change occurred
      if (needsUpdate) {
        // Only re-sort if the timestamp changed in a way that requires it
        if (needsSort) {
           // console.log("Sorting history due to timestamp update");
           return updatedHistory.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        } else {
           // console.log("Updating history item without sorting");
           // Return the updated array, but maintain the existing order
           return updatedHistory;
        }
      } else {
        // If no changes detected, return the exact previous state object
        // This prevents an unnecessary re-render cycle
        // console.log("No history item update needed");
        return prevHistory;
      }
    });
  }, [conversation?.id, conversation?.title, conversation?.updatedAt, history.length, loading]);

  // USEMEMO TO COMPUTE DISPLAYED HISTORY
  const displayedHistory = React.useMemo(() => {
    // Don't compute until initial load is done and we have a conversation context
    if (loading || !conversation) {
      // Return raw history during loading or if context is missing initially
      return history.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    let updated = false;
    let itemExists = false;
    const baseHistory = [...history]; // Create a mutable copy

    // Check if the current conversation exists and update/add it
    const currentConvIndex = baseHistory.findIndex(item => item.id === conversation.id);
    const currentConvTitle = conversation.title || 'New Chat';
    const currentConvTimestamp = new Date(conversation.updatedAt || Date.now()).toISOString();

    if (currentConvIndex > -1) {
      // Item exists, check if it needs updating
      itemExists = true;
      const existingItem = baseHistory[currentConvIndex];
      if (existingItem.title !== currentConvTitle || existingItem.updatedAt !== currentConvTimestamp) {
        baseHistory[currentConvIndex] = { 
          ...existingItem, 
          title: currentConvTitle, 
          updatedAt: currentConvTimestamp 
        };
        updated = true;
      }
    } else if (conversation.id && conversation.rootMessageId) {
      // Item doesn't exist, and it's a valid conversation, add it
      const newHistoryItem: HistoryItem = {
        id: conversation.id,
        title: currentConvTitle,
        updatedAt: currentConvTimestamp,
      };
      baseHistory.push(newHistoryItem);
      updated = true;
    }

    // If we added or updated an item, or if the raw history changed, re-sort
    // Always sort if baseHistory has items to ensure correct initial order
    if (updated || baseHistory.length > 0) {
      return baseHistory.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } 
    
    // If no changes and list wasn't empty, return the original (but sorted)
    return history.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  }, [history, conversation, loading]); // Dependencies: raw history, conversation context, loading state

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
    // Clear any previous errors when starting a new conversation
    setError(null);
    
    // Find any unused chats in the list to clean up
    const unusedChats = history.filter(item => item.title === "New Chat");
    
    if (unusedChats.length > 0) {
      // Clean up all unused chats
      for (const chat of unusedChats) {
        // Skip the current chat for now - it will be replaced automatically
        if (chat.id === conversation?.id) continue;
        
        // Remove any other unused chats with animation
        setRemovingId(chat.id);
        
        // Clean up from state and database
        setTimeout(async () => {
          setHistory(prevHistory => prevHistory.filter(item => item.id !== chat.id));
          
          // Also remove from database if user is logged in
          if (session) {
            try {
              await supabase
                .from('conversations')
                .delete()
                .eq('id', chat.id);
            } catch (error) {
              console.error('Error deleting unused chat:', error);
            }
          }
          
          // Clear removing state
          setRemovingId(null);
        }, 300);
      }
    }
    
    // Start a new conversation (will replace current one if unused)
    startNewConversation();
  };

  // Add effect to clear error if we're looking at a new/empty chat
  useEffect(() => {
    // Check if current conversation is a new/empty chat (only has system message)
    if (conversation) {
      const messagesArray = Object.values(conversation.messages);
      const isNewChat = messagesArray.length === 1 && messagesArray[0].role === 'system';
      
      if (isNewChat) {
        // Clear any previous error if we're viewing a new chat
        setError(null);
      }
    }
  }, [conversation]);

  // Also clear errors whenever we change the active conversation
  useEffect(() => {
    if (activeConversationId) {
      setError(null);
    }
  }, [activeConversationId]);

  // Custom double chevron component
  const DoubleChevronLeft = () => (
    <div className="flex items-center">
      <FiChevronLeft className="h-5 w-5" />
      <FiChevronLeft className="h-5 w-5 -ml-3" />
    </div>
  );

  // Fix for handling clicks on non-active chats that might be new/unused
  const handleConversationClick = async (item: HistoryItem) => {
    // If this is the active conversation and a New Chat, just create a new one
    if (item.id === activeConversationId && item.title === "New Chat") {
      startNewConversation();
      return;
    }
    
    // Check if this conversation is already marked as unused
    if (item.id === unusedChatId) {
      // Just start a new conversation since this chat is unused anyway
      startNewConversation();
      
      // Remove the unused chat with animation
      setRemovingId(item.id);
      setTimeout(async () => {
        setHistory(prevHistory => prevHistory.filter(hist => hist.id !== item.id));
        
        // Clean up from database if user is logged in
        if (session) {
          try {
            await supabase
              .from('conversations')
              .delete()
              .eq('id', item.id);
          } catch (error) {
            console.error('Error deleting unused chat:', error);
          }
        }
        
        setRemovingId(null);
      }, 500);
      
      return;
    }
    
    // For any other case, try to load the conversation first
    if (!session) return;
    
    // Track which conversation is loading without showing loading UI immediately
    setLoadingConversation(item.id);
    
    try {
      // Check if this is a valid conversation by fetching its messages
      const { data: msgs, error: msgsError } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', item.id);
      
      // Special handling for conversations with no messages or just a system message
      if (!msgsError && (msgs.length === 0 || (msgs.length === 1 && msgs[0].role === 'system'))) {
        // This is an unused chat that wasn't caught by our main detector
        // Start a new conversation instead
        startNewConversation();
        
        // And remove this one
        setRemovingId(item.id);
        setTimeout(async () => {
          setHistory(prevHistory => prevHistory.filter(hist => hist.id !== item.id));
          
          // Clean up from database
          try {
            await supabase
              .from('conversations')
              .delete()
              .eq('id', item.id);
          } catch (error) {
            console.error('Error deleting unused chat:', error);
          }
          
          setRemovingId(null);
          setLoadingConversation(null);
        }, 500);
        
        return;
      }
      
      // Otherwise, proceed with normal loading
      loadConversation(item.id);
      
    } catch (error) {
      console.error('Error checking conversation status:', error);
      // Fall back to normal loading in case of errors
      loadConversation(item.id);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus the rename input when it appears
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Handle renaming a conversation
  const handleRename = async (id: string) => {
    if (!session || !newTitle.trim()) return;
    
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ title: newTitle.trim() })
        .eq('id', id);
        
      if (error) throw error;
      
      // Update local state
      setHistory(prevHistory => 
        prevHistory.map(item => 
          item.id === id ? { ...item, title: newTitle.trim() } : item
        )
      );
      
      // If this is the active conversation, update the conversation context
      if (id === activeConversationId && conversation) {
        setConversation({
          ...conversation,
          title: newTitle.trim()
        });
      }
    } catch (error) {
      console.error('Error renaming conversation:', error);
    } finally {
      setIsRenaming(null);
      setNewTitle('');
      setActiveMenu(null);
    }
  };

  // Handle deleting a conversation
  const handleDelete = async (id: string) => {
    if (!session) return;
    
    try {
      setRemovingId(id);
      
      // Delete from database
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      // Update local state after animation
      setTimeout(() => {
        setHistory(prevHistory => prevHistory.filter(item => item.id !== id));
        
        // If this was the active conversation, start a new one
        if (id === activeConversationId) {
          startNewConversation();
        }
        
        setRemovingId(null);
      }, 500);
    } catch (error) {
      console.error('Error deleting conversation:', error);
      setRemovingId(null);
    } finally {
      setActiveMenu(null);
    }
  };

  // Check if an item is near the bottom of the container
  const isNearBottom = (itemId: string): boolean => {
    if (!containerRef.current) return false;
    
    const container = containerRef.current;
    const item = container.querySelector(`[data-item-id="${itemId}"]`);
    
    if (!item) return false;
    
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    
    // If the item is in the bottom third of the container
    return itemRect.bottom > (containerRect.top + (containerRect.height * 0.66));
  };

  return (
    <div 
      ref={containerRef}
      className="h-full w-80 bg-white border-r border-gray-200 overflow-y-auto p-4 flex flex-col"
    >
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-lg font-semibold text-gray-900">Chat History</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800 cursor-pointer">
            <DoubleChevronLeft />
          </button>
        </div>
      </div>
      
      <button 
        onClick={handleNewChat}
        className="flex items-center justify-center gap-2 w-full py-2 px-3 mb-6 text-sm font-medium rounded-md border border-gray-200 text-gray-700 bg-white hover:bg-gray-100 transition-colors"
      >
        <FiEdit className="h-4 w-4" />
        <span>New Conversation</span>
      </button>
      
      <div className="text-sm font-medium text-gray-500 mb-2">Recent conversations</div>
      
      {/* Only show loading when there's no history content yet */}
      {/* {loading && history.length === 0 && <p className="text-gray-500">Loading...</p>} */}
      
      {/* Only show error messages for actual load failures, not when we have a valid conversation */}
      {error && !(conversation && Object.keys(conversation.messages).length > 0) && 
        <p className="text-red-600">{error}</p>
      }
      
      {/* Render list section only when loading is complete */} 
      {!loading && (
        <> { /* Fragment to group conditional elements */ }
          {/* Always show history list if it exists, even during subsequent loads */}
          {/* Use displayedHistory computed by useMemo */} 
          {displayedHistory.length > 0 ? (
            <ul className="list-none p-0 m-0">
              {displayedHistory.filter((item, index, self) => 
                // Filter out duplicate IDs - keep only the first occurrence
                index === self.findIndex(t => t.id === item.id)
              ).map(item => (
                <AnimatePresence mode="popLayout" key={item.id} initial={false}>
                  {removingId !== item.id && (
                    <motion.li 
                      key={item.id}
                      className="mb-2 list-none relative"
                      initial={{ opacity: 1, height: 'auto' }}
                      exit={{ 
                        opacity: 0,
                        height: 0,
                        marginBottom: 0,
                        transition: { 
                          opacity: { duration: 0.2 },
                          height: { duration: 0.3, delay: 0.1 }
                        }
                      }}
                      layout
                      data-item-id={item.id}
                    >
                      {isRenaming === item.id ? (
                        <motion.div 
                          className="relative h-12 flex flex-col justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div
                            className={`w-full text-left px-2 py-2 rounded transition-colors duration-150 ease-in-out group ${ 
                              item.id === activeConversationId 
                                ? 'bg-gray-900 text-white hover:bg-gray-800' 
                                : 'hover:bg-gray-100'
                            } ${loadingConversation === item.id ? 'opacity-70' : ''}`}
                          >
                            <div className={`font-medium ${item.id === activeConversationId ? 'text-white' : 'text-gray-900'} flex items-center`}>
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRename(item.id);
                                  if (e.key === 'Escape') {
                                    setIsRenaming(null);
                                    setNewTitle('');
                                  }
                                  // Prevent event propagation to avoid triggering button click
                                  e.stopPropagation();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={`truncate max-w-[85%] ${activeMenu === item.id || item.id === activeConversationId ? 'pr-7' : ''} bg-transparent focus:outline-none rounded px-1 -ml-1 ${item.id === activeConversationId ? 'text-white' : 'text-gray-900'}`}
                                placeholder="Enter new title"
                                autoFocus
                              />
                              {loadingConversation === item.id && (
                                <span className="ml-2 inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                              )}
                            </div>
                            <div className={`text-xs ${item.id === activeConversationId ? 'text-gray-300' : 'text-gray-500'}`}>{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</div>
                            
                            {/* Edit confirm button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRename(item.id);
                              }}
                              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full ${
                                item.id === activeConversationId 
                                  ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
                              } opacity-100`}
                            >
                              <FiEdit2 className="h-4 w-4" />
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div 
                          className="relative h-12 flex flex-col justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div
                            onClick={() => handleConversationClick(item)}
                            className={`w-full text-left px-2 py-2 rounded transition-colors duration-150 ease-in-out group ${ 
                              item.id === activeConversationId 
                                ? 'bg-gray-900 text-white hover:bg-gray-800' 
                                : 'hover:bg-gray-100'
                            } ${loadingConversation === item.id ? 'opacity-70' : ''} cursor-pointer`}
                          >
                            <div className={`font-medium ${item.id === activeConversationId ? 'text-white' : 'text-gray-900'} flex items-center`}>
                              <span className={`truncate max-w-[85%] ${activeMenu === item.id || item.id === activeConversationId ? 'pr-7' : ''}`}>
                                {item.title}
                              </span>
                              {loadingConversation === item.id && (
                                <span className="ml-2 inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                              )}
                            </div>
                            <div className={`text-xs ${item.id === activeConversationId ? 'text-gray-300' : 'text-gray-500'}`}>{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</div>
                            
                            {/* 3-dot menu button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(activeMenu === item.id ? null : item.id);
                              }}
                              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full ${
                                item.id === activeConversationId 
                                  ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
                              } ${(activeMenu === item.id || item.id === activeConversationId) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                              <FiMoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                          
                          {/* Dropdown menu */}
                          {activeMenu === item.id && (
                            <div 
                              ref={menuRef}
                              className="fixed left-[310px] top-auto z-50 w-48 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-gray-200 focus:outline-none overflow-hidden"
                              style={{
                                top: (() => {
                                  // Get the button's position to align the menu with it
                                  const buttonElement = document.querySelector(`[data-item-id="${item.id}"] button`);
                                  if (buttonElement) {
                                    const rect = buttonElement.getBoundingClientRect();
                                    return `${rect.top}px`;
                                  }
                                  return 'auto';
                                })()
                              }}
                            >
                              <div className="py-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsRenaming(item.id);
                                    setNewTitle(item.title);
                                    setActiveMenu(null);
                                  }}
                                  className="flex items-center w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <FiEdit2 className="mr-3 h-4 w-4" />
                                  Rename
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(item.id);
                                    setActiveMenu(null);
                                  }}
                                  className="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-gray-50"
                                >
                                  <FiTrash2 className="mr-3 h-4 w-4" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.li>
                  )}
                </AnimatePresence>
              ))}
            </ul>
          ) : (
            <div className="text-center text-gray-500 pt-10">
              <p>No conversation history yet.</p>
              <p className="mt-2">Start a new chat to begin!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ChatHistory; 