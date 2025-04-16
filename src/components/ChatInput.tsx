import React, { useState, KeyboardEvent, FormEvent } from 'react';
import { IoMdMic, IoMdArrowUp, IoMdAttach } from 'react-icons/io';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const message = inputValue.trim();
    if (message && !isLoading) {
      onSendMessage(message);
      setInputValue('');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      className="flex items-end p-4 m-4 border border-gray-300 rounded-xl bg-white shadow-sm"
    >
      <button 
        type="button" 
        className="p-2 text-gray-500 hover:text-gray-700 flex-shrink-0"
      >
        <IoMdMic size={20} />
      </button>

      <button 
        type="button" 
        className="p-2 mr-2 text-gray-500 hover:text-gray-700 flex-shrink-0"
      >
        <IoMdAttach size={20} />
      </button>

      <textarea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="How can Grok help?"
        disabled={isLoading}
        className="flex-grow px-2 py-1.5 bg-transparent border-none focus:outline-none focus:ring-0 resize-none max-h-40 overflow-y-auto text-sm"
        rows={1}
      />

      <button
        type="submit"
        disabled={isLoading || !inputValue.trim()}
        className="p-2 ml-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
      >
        <IoMdArrowUp size={20} />
      </button>
    </form>
  );
};

export default ChatInput; 