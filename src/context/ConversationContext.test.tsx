import React, { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ConversationProvider, useConversation } from './ConversationContext';
import { Conversation, MessageNode } from '../types/conversation';
import { v4 as uuidv4 } from 'uuid';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    length: 0,
    key: (index: number) => null
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Helper to wrap the hook with the provider
const wrapper = ({ children }: { children: ReactNode }) => (
  <ConversationProvider>{children}</ConversationProvider>
);

describe('ConversationContext', () => {
  let mockUuidCounter = 0;

  beforeEach(() => {
    // Reset mocks before each test
    localStorageMock.clear();
    (uuidv4 as jest.Mock).mockImplementation(() => `test-uuid-${mockUuidCounter++}`);
     mockUuidCounter = 0; // Reset counter for predictable IDs
     // Suppress console logs/warns/errors during tests unless needed
     jest.spyOn(console, 'log').mockImplementation(() => {});
     jest.spyOn(console, 'warn').mockImplementation(() => {});
     jest.spyOn(console, 'error').mockImplementation(() => {});
  });

   afterEach(() => {
     jest.restoreAllMocks(); // Restore console mocks
   });


  it('should initialize with null conversation and empty messages after loading', async () => {
    const { result } = renderHook(() => useConversation(), { wrapper });
    // Wait for the initial loading useEffect to finish
    await waitFor(() => expect(result.current).toBeDefined()); // Basic check for provider readiness
    
    // Since localStorage is empty, state should be null/empty
    expect(result.current.conversation).toBeNull();
    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.currentMessages).toEqual([]);
  });

  it('should add the first message and create a conversation', async () => {
    const { result } = renderHook(() => useConversation(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined()); // Wait for load

    act(() => {
      result.current.addMessage({ role: 'user', content: 'Hello' });
    });

    expect(result.current.conversation).not.toBeNull();
    expect(result.current.conversation?.id).toBe('test-uuid-1'); // Conv ID
    expect(result.current.conversation?.rootMessageId).toBe('test-uuid-0'); // Msg ID
    expect(Object.keys(result.current.conversation?.messages ?? {})).toHaveLength(1);
    const firstMessage = result.current.conversation?.messages['test-uuid-0'];
    expect(firstMessage?.content).toBe('Hello');
    expect(firstMessage?.role).toBe('user');
    expect(firstMessage?.parentId).toBeNull();
    expect(result.current.activeMessageId).toBe('test-uuid-0');
    expect(result.current.currentMessages).toHaveLength(1);
    expect(result.current.currentMessages[0]?.id).toBe('test-uuid-0');
  });

  it('should add subsequent messages as children of the active message', async () => {
    const { result } = renderHook(() => useConversation(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined()); // Wait for load

    // Add first message
    act(() => {
      result.current.addMessage({ role: 'user', content: 'First' }); // ID: uuid-0, Conv ID: uuid-1
    });
    const firstMsgId = 'test-uuid-0';
    expect(result.current.activeMessageId).toBe(firstMsgId);

    // Add second message (child of first)
    act(() => {
      result.current.addMessage({ role: 'assistant', content: 'Second' }); // ID: uuid-2
    });
     const secondMsgId = 'test-uuid-2';
     expect(result.current.activeMessageId).toBe(secondMsgId);
     expect(result.current.conversation?.messages[secondMsgId]?.parentId).toBe(firstMsgId);
     expect(Object.keys(result.current.conversation?.messages ?? {})).toHaveLength(2);
     expect(result.current.currentMessages).toHaveLength(2); // Path: [msg0, msg2]
     expect(result.current.currentMessages[0]?.id).toBe(firstMsgId);
     expect(result.current.currentMessages[1]?.id).toBe(secondMsgId);

    // Add third message (child of second)
    act(() => {
      result.current.addMessage({ role: 'user', content: 'Third' }); // ID: uuid-3
    });
     const thirdMsgId = 'test-uuid-3';
    expect(result.current.activeMessageId).toBe(thirdMsgId);
    expect(result.current.conversation?.messages[thirdMsgId]?.parentId).toBe(secondMsgId);
    expect(Object.keys(result.current.conversation?.messages ?? {})).toHaveLength(3);
    expect(result.current.currentMessages).toHaveLength(3); // Path: [msg0, msg2, msg3]
  });

   it('should add a message as a child of a specific parentId', async () => {
    const { result } = renderHook(() => useConversation(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined()); // Wait for load

    // Setup: msg0 -> msg2
    act(() => {
      result.current.addMessage({ role: 'user', content: 'First' }); // msg0, conv1
    });
     const msg0Id = 'test-uuid-0';
    act(() => {
      result.current.addMessage({ role: 'assistant', content: 'Second' }); // msg2 (child of msg0)
    });
     const msg2Id = 'test-uuid-2';
     expect(result.current.activeMessageId).toBe(msg2Id); // Active is msg2

    // Add msg3 as child of msg0 (branching)
    act(() => {
      result.current.addMessage({ role: 'assistant', content: 'Branch' }, msg0Id); // msg3
    });
     const msg3Id = 'test-uuid-3';

     expect(result.current.activeMessageId).toBe(msg3Id); // New message becomes active
     expect(result.current.conversation?.messages[msg3Id]?.parentId).toBe(msg0Id);
     expect(Object.keys(result.current.conversation?.messages ?? {})).toHaveLength(3); // msg0, msg2, msg3
     // Current path should be root -> msg0 -> msg3
     expect(result.current.currentMessages).toHaveLength(2); 
     expect(result.current.currentMessages[0]?.id).toBe(msg0Id);
     expect(result.current.currentMessages[1]?.id).toBe(msg3Id);
  });


  it('should select a branch and update current messages', async () => {
     const { result } = renderHook(() => useConversation(), { wrapper });
     await waitFor(() => expect(result.current).toBeDefined()); // Wait for load

    // Setup: msg0 -> msg2
    //        -> msg4 
    let msg0Id: string, msg2Id: string, msg4Id: string;
    act(() => { const node = result.current.addMessage({ role: 'user', content: 'Root' }); msg0Id = node!.id; }); // msg0, conv1
    act(() => { const node = result.current.addMessage({ role: 'assistant', content: 'Branch 1' }); msg2Id = node!.id; }); // msg2 (child of msg0)
    act(() => { result.current.selectBranch(msg0Id); }); // Select root before adding second branch
    act(() => { const node = result.current.addMessage({ role: 'assistant', content: 'Branch 2' }, msg0Id); msg4Id = node!.id; }); // msg4 (child of msg0)
    
    expect(result.current.activeMessageId).toBe(msg4Id); // Branch 2 is active
    expect(result.current.currentMessages.map(m => m.id)).toEqual([msg0Id, msg4Id]);

    // Select Branch 1 (msg2)
    act(() => {
      result.current.selectBranch(msg2Id);
    });

    expect(result.current.activeMessageId).toBe(msg2Id);
    expect(result.current.currentMessages.map(m => m.id)).toEqual([msg0Id, msg2Id]);
    expect(result.current.currentMessages).toHaveLength(2);
    expect(result.current.currentMessages[1]?.content).toBe('Branch 1');

    // Select Root (msg0)
    act(() => {
       result.current.selectBranch(msg0Id);
    });
    expect(result.current.activeMessageId).toBe(msg0Id);
    expect(result.current.currentMessages.map(m => m.id)).toEqual([msg0Id]);
  });
  
  it('should not select a non-existent messageId', async () => {
     const { result } = renderHook(() => useConversation(), { wrapper });
     await waitFor(() => expect(result.current).toBeDefined()); // Wait for load

      act(() => { result.current.addMessage({ role: 'user', content: 'Hello' }); }); // msg0, conv1
      const initialActiveId = result.current.activeMessageId;
      
      act(() => { result.current.selectBranch('non-existent-id'); });
      
      expect(result.current.activeMessageId).toBe(initialActiveId); // Should not change
      expect(console.warn).toHaveBeenCalledWith('selectBranch: Message ID non-existent-id not found.');
  });

  // Persistence Tests
  it('should save conversation and activeId to localStorage', async () => {
    const { result } = renderHook(() => useConversation(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined()); // Wait for load

    act(() => {
      result.current.addMessage({ role: 'user', content: 'Test Save' }); // msg0, conv1
    });
    
    const expectedConv = result.current.conversation;
    const expectedActiveId = result.current.activeMessageId;

    // Wait for the save useEffects triggered by state change
    await waitFor(() => {
        expect(localStorageMock.getItem('supergrok_conversation')).toEqual(JSON.stringify(expectedConv));
        expect(localStorageMock.getItem('supergrok_activeMessageId')).toEqual(expectedActiveId);
    });
  });

  it('should load conversation and activeId from localStorage on init', async () => {
     // Setup localStorage *before* rendering the hook
     const msg1: MessageNode = { id: 'msg-a', parentId: null, role: 'user', content: 'Loaded msg', timestamp: Date.now() };
     const initialConv: Conversation = {
         id: 'conv-load',
         rootMessageId: 'msg-a',
         messages: { 'msg-a': msg1 },
         createdAt: Date.now()
     };
     localStorageMock.setItem('supergrok_conversation', JSON.stringify(initialConv));
     localStorageMock.setItem('supergrok_activeMessageId', 'msg-a');

    const { result } = renderHook(() => useConversation(), { wrapper });
    
    // Wait for loading and state update
    await waitFor(() => {
        expect(result.current.conversation?.id).toBe('conv-load');
    });

    // State should reflect loaded data
    expect(Object.keys(result.current.conversation?.messages ?? {})).toHaveLength(1);
    expect(result.current.conversation?.messages['msg-a']?.content).toBe('Loaded msg');
    expect(result.current.activeMessageId).toBe('msg-a');
    expect(result.current.currentMessages).toHaveLength(1);
    expect(result.current.currentMessages[0]?.id).toBe('msg-a');
  });
  
   it('should handle invalid JSON data in localStorage', async () => {
      localStorageMock.setItem('supergrok_conversation', 'invalid json');
      localStorageMock.setItem('supergrok_activeMessageId', 'some-id');
      
      const { result } = renderHook(() => useConversation(), { wrapper });
      
      // Wait for loading to complete
      await waitFor(() => {
           expect(result.current.conversation).toBeNull();
      });
      
      expect(result.current.activeMessageId).toBeNull();
      expect(localStorageMock.getItem('supergrok_conversation')).toBeNull(); // Should be removed
      expect(localStorageMock.getItem('supergrok_activeMessageId')).toBeNull(); // Should be removed
      expect(console.error).toHaveBeenCalledWith('Error loading from localStorage:', expect.any(SyntaxError)); // Log error during load
   });

   it('should handle partially invalid data in localStorage (e.g., structurally wrong object)', async () => {
      localStorageMock.setItem('supergrok_conversation', JSON.stringify({ id: 'bad-conv', messages: null })); // Missing/invalid messages
      localStorageMock.setItem('supergrok_activeMessageId', 'some-id');
      
      const { result } = renderHook(() => useConversation(), { wrapper });
      
      await waitFor(() => {
           expect(result.current.conversation).toBeNull();
      });
      
      expect(result.current.activeMessageId).toBeNull();
      expect(localStorageMock.getItem('supergrok_conversation')).toBeNull(); 
      expect(localStorageMock.getItem('supergrok_activeMessageId')).toBeNull(); 
      expect(console.warn).toHaveBeenCalledWith('Invalid conversation data found in localStorage');
   });

}); 