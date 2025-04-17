import React, { useEffect, useState } from 'react';
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
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ onClose, onLoadConversation }) => {
  const { session } = useAuth();
  const { setConversation, setActiveMessageId, startNewConversation } = useConversation();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!session) return;
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('conversations')
        .select('id, title, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });
      if (fetchError) {
        console.error('Error loading conversation history:', fetchError);
        setError('Failed to load history.');
      } else if (data) {
        setHistory(
          data.map(conv => ({ id: conv.id, title: conv.title || 'Untitled', updatedAt: conv.updated_at }))
        );
      }
      setLoading(false);
    };
    fetchHistory();
  }, [session]);

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
    setLoading(true);
    
    try {
      // 1. Fetch conversation metadata
      const { data: meta, error: metaError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', convId)
        .single();
        
      if (metaError || !meta) {
        console.error('Error loading conversation metadata:', metaError);
        setError('Failed to load conversation.');
        setLoading(false);
        return;
      }
      
      // 2. Fetch all messages for the conversation
      const { data: msgs, error: msgsError } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', convId);
        
      if (msgsError || !msgs) {
        console.error('Error loading conversation messages:', msgsError);
        setError('Failed to load conversation messages.');
        setLoading(false);
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
      };
      setConversation(conversationData);
      
      // 5. Find the ID of the LATEST message in the main thread
      const latestMessageId = findLatestMessageId(messagesMap, meta.root_message_id);
      
      // 6. Set the active message ID to the LATEST message
      // This is crucial for displaying the conversation correctly
      if (latestMessageId) {
        setActiveMessageId(latestMessageId);
        console.log(`Loaded conversation ${meta.id}. Active message set to latest: ${latestMessageId}`);
      } else {
         // Fallback if latest couldn't be found (shouldn't usually happen if root exists)
         setActiveMessageId(meta.root_message_id);
         console.log(`Loaded conversation ${meta.id}. Could not find latest message, setting active to root: ${meta.root_message_id}`);
      }
      
      // 7. Reset branch stack if provided
      if (onLoadConversation) {
        onLoadConversation();
      }
      
      // Close the sidebar only after successful loading
      onClose();
    } catch (error) {
      console.error('Unexpected error loading conversation:', error);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    startNewConversation();
    onClose();
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
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        history.length === 0 ? (
          <p className="text-gray-500">No conversations found.</p>
        ) : (
          <ul className="list-none p-0 m-0">
            {history.map(item => (
              <li key={item.id} className="mb-2 list-none">
                <button
                  onClick={() => loadConversation(item.id)}
                  className="w-full text-left px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <div className="font-medium text-gray-900 dark:text-gray-200">{item.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</div>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};

export default ChatHistory; 