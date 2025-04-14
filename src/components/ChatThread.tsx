import React, { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import { Message } from '../types/chat';

interface ChatThreadProps {
  messages: Message[];
  isLoading: boolean;
}

const ChatThread: React.FC<ChatThreadProps> = ({ messages, isLoading }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]); // Scroll when messages change or loading state changes

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {isLoading && (
        <div className="flex justify-start">
          <div className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 self-start">
            <span className="animate-pulse">...</span> {/* Simple loading indicator */}
          </div>
        </div>
      )}
      <div ref={messagesEndRef} /> {/* Anchor for scrolling */}    
    </div>
  );
};

export default ChatThread; 