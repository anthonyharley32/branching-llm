import React, { useRef, useEffect } from 'react';
import { MessageNode } from '../types/conversation';
import ChatMessage from './ChatMessage';
import { AddMessageResult } from '../context/ConversationContext';

interface ChatThreadProps {
  messages: MessageNode[];
  isLoading: boolean;
  onBranchCreated: (result: AddMessageResult, sourceText: string, isNewBranch: boolean) => void;
}

const ChatThread: React.FC<ChatThreadProps> = ({ messages = [], isLoading, onBranchCreated }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filter out empty system messages that don't need to be displayed
  const displayMessages = messages.filter(msg => !(msg.role === 'system' && !msg.content.trim()));

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4">
      {displayMessages.map((msg, index) => (
        <ChatMessage 
          key={msg.id || `msg-${index}`} 
          message={msg}
          onBranchCreated={onBranchCreated}
        />
      ))}
      {isLoading && (
        <div className="flex justify-center items-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        </div>
      )}
      {displayMessages.length === 0 && !isLoading && (
        <div className="text-center text-gray-500 dark:text-gray-400 pt-10">
          Start the conversation!
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatThread; 