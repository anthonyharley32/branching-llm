import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MessageNode } from '../types/conversation';
import ChatMessage from './ChatMessage';
import { AddMessageResult } from '../context/ConversationContext';

interface ChatThreadProps {
  messages: MessageNode[];
  isLoading: boolean;
  /** If provided, the ID of the assistant message currently streaming. */
  streamingNodeId?: string | null;
  onBranchCreated: (result: AddMessageResult, sourceText: string, isNewBranch: boolean) => void;
}

const ChatThread: React.FC<ChatThreadProps> = ({ messages = [], isLoading, streamingNodeId = null, onBranchCreated }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevMessagesLengthRef = useRef(messages.length);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  
  // Use refs for scroll state to avoid race conditions with rapid updates
  const userScrolledRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const scrollLockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);

  // Handle checking if we're near the bottom
  const checkIfNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return false;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    // Use a smaller threshold (50px instead of 100px) for more precise detection
    return scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  // Function to scroll to bottom - use when we know we want to scroll
  const scrollToBottom = useCallback((smooth = true) => {
    if (!autoScrollEnabledRef.current) return;
    
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: smooth ? "smooth" : "auto",
        block: "end"
      });
    }
  }, []);

  // Clear scroll lock after a period of time
  const clearScrollLock = useCallback(() => {
    if (scrollLockTimeoutRef.current) {
      clearTimeout(scrollLockTimeoutRef.current);
    }
    
    // Set a timeout to reset the scroll lock after 1 second of no scroll events
    scrollLockTimeoutRef.current = setTimeout(() => {
      // Only reset if user is at bottom
      if (checkIfNearBottom()) {
        userScrolledRef.current = false;
        autoScrollEnabledRef.current = true;
        setUserHasScrolled(false);
      }
    }, 1000);
  }, [checkIfNearBottom]);

  // Initialize scroll detection on wheel events - catches scrolling attempts immediately
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // If user is scrolling up, immediately lock scrolling
      if (e.deltaY < 0) {
        lastScrollTimeRef.current = Date.now();
        userScrolledRef.current = true;
        autoScrollEnabledRef.current = false;
        setUserHasScrolled(true);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Monitor scroll events to detect when user manually scrolls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const now = Date.now();
      const bottom = checkIfNearBottom();
      setIsNearBottom(bottom);
      
      // Detect manual scrolling:
      // 1. Not near bottom AND 
      // 2. Recent scroll event (within 100ms) that wasn't triggered by auto-scroll
      if (!bottom && now - lastScrollTimeRef.current < 100) {
        userScrolledRef.current = true;
        autoScrollEnabledRef.current = false;
        setUserHasScrolled(true);
      }
      
      // Record scroll time for all events
      lastScrollTimeRef.current = now;
      
      // If user scrolls back to bottom, start timer to reset the flag
      if (bottom && userScrolledRef.current) {
        clearScrollLock();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollLockTimeoutRef.current) {
        clearTimeout(scrollLockTimeoutRef.current);
      }
    };
  }, [checkIfNearBottom, clearScrollLock]);

  // Set up MutationObserver to detect content changes in real-time
  useEffect(() => {
    // Only activate MutationObserver during streaming
    if (!streamingNodeId || !containerRef.current) {
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
      }
      return;
    }

    // Find the streaming message element
    const streamingMessageId = streamingNodeId;
    const lastMessageId = lastMessageIdRef.current = streamingMessageId;
    
    // Function to handle DOM mutations
    const handleMutations = (mutations: MutationRecord[]) => {
      // Only proceed if we're still streaming the same message
      if (lastMessageId !== lastMessageIdRef.current) return;

      let hasRelevantChange = false;
      
      // Check if any mutations are relevant to our content
      for (const mutation of mutations) {
        if (
          mutation.type === 'childList' || 
          mutation.type === 'characterData' ||
          mutation.target.nodeType === Node.TEXT_NODE
        ) {
          hasRelevantChange = true;
          break;
        }
      }

      // If relevant content changed and auto-scroll is enabled, scroll to bottom
      if (hasRelevantChange && autoScrollEnabledRef.current && !userScrolledRef.current) {
        scrollToBottom(false); // Use non-smooth scrolling for frequent updates
      }
    };

    // Create new MutationObserver
    const observer = new MutationObserver(handleMutations);
    
    // Configure and start observing the container
    observer.observe(containerRef.current, {
      childList: true,      // Observe direct children changes
      subtree: true,        // Observe all descendants
      characterData: true,  // Observe text content changes
    });

    // Store observer reference and clean up on unmount or when streaming stops
    mutationObserverRef.current = observer;
    
    return () => {
      observer.disconnect();
      mutationObserverRef.current = null;
    };
  }, [streamingNodeId, scrollToBottom]);

  // Handle new message additions
  useEffect(() => {
    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;
    
    // For new messages, always try to scroll to bottom unless user specifically scrolled away
    if (hasNewMessages) {
      // Reset scroll lock for new messages unless user is actively scrolled away
      if (checkIfNearBottom()) {
        userScrolledRef.current = false;
        autoScrollEnabledRef.current = true;
        setUserHasScrolled(false);
      }
      
      // If auto-scroll is enabled or this is a new message (not just content update)
      if (autoScrollEnabledRef.current || !streamingNodeId) {
        // Use RAF to ensure the DOM has updated
        requestAnimationFrame(() => {
          scrollToBottom(true);
        });
      }
    }
  }, [messages.length, streamingNodeId, checkIfNearBottom, scrollToBottom]);

  // Handle initial mount and container resize
  useEffect(() => {
    // Initial scroll to bottom when component mounts
    scrollToBottom(false);
    
    // Create a ResizeObserver to handle container resizing
    const resizeObserver = new ResizeObserver(() => {
      if (!userScrolledRef.current) {
        scrollToBottom(false);
      }
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollToBottom]);

  // Filter out empty system messages, but keep the root message if it's the only one
  const displayMessages = messages.filter(msg => {
    // Keep the message if it's not a system message OR if it has content
    if (msg.role !== 'system' || msg.content.trim()) {
      return true;
    }
    // If it IS a system message with empty content, only keep it if it's the *only* message
    return messages.length === 1;
  });

  const showInitialLoading = isLoading && !streamingNodeId;

  return (
    <div 
      ref={containerRef} 
      className="flex-grow overflow-y-auto p-4 space-y-4"
      onMouseDown={() => {
        // On any mouse interaction, prepare to detect manual scrolling
        lastScrollTimeRef.current = Date.now();
      }}
      onTouchStart={() => {
        // Also handle touch devices
        lastScrollTimeRef.current = Date.now();
      }}
    >
      {displayMessages.map((msg, index) => (
        <ChatMessage 
          key={msg.id || `msg-${index}`} 
          message={msg}
          streamingNodeId={streamingNodeId}
          onBranchCreated={onBranchCreated}
        />
      ))}
      {showInitialLoading && (
        <div className="flex flex-col items-start p-4 text-gray-800 px-4 max-w-prose self-start">
          {/* Squiggly wave placeholder - now a container for multiple lines */}
          <div className="scribble-container">
            <div className="relative w-40 h-4 streaming-wave streaming-wave-1" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-2" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-3" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-4" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-5" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-6" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-7" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-8" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-9" />
            <div className="relative w-40 h-4 streaming-wave streaming-wave-10" />
          </div>
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