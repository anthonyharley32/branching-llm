import React, { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import ChatMessage from './components/ChatMessage'
import ChatInput from './components/ChatInput'
import ChatThread from './components/ChatThread'
import { ConversationProvider, useConversation } from './context/ConversationContext'
import { generateCompletion, LLMError, ErrorType } from './services/llm/openai'
import { MessageNode } from './types/conversation'

function AppContent() {
  const { 
    currentMessages, 
    addMessage, 
    activeMessageId,
  } = useConversation();

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<LLMError | null>(null)

  const handleSendMessage = async (text: string) => {
    setIsLoading(true)
    setError(null)

    const userMessageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'> = {
      role: 'user',
      content: text,
    }
    const addResult = addMessage(userMessageData)

    if (!addResult) {
      console.error('Failed to add user message to context')
      setError({ type: ErrorType.UNKNOWN, message: 'Failed to add user message locally.'})
      setIsLoading(false)
      return
    }

    const { newNode: userMessageNode, messagePath: userMessagePath } = addResult

    try {
      const apiMessages = userMessagePath.map(node => ({ role: node.role, content: node.content }))

      console.log('Sending context to LLM:', apiMessages)

      const aiResponse = await generateCompletion(apiMessages)

      const aiMessageData: Omit<MessageNode, 'id' | 'parentId' | 'createdAt'> = {
        role: aiResponse.role,
        content: aiResponse.content,
      }
      addMessage(aiMessageData, userMessageNode.id)

    } catch (err) {
      console.error("Failed to get AI response:", err)
      if (err instanceof Error && 'type' in err && Object.values(ErrorType).includes((err as LLMError).type)) {
        setError(err as LLMError)
      } else {
        setError({
          type: ErrorType.UNKNOWN,
          message: err instanceof Error ? err.message : 'An unexpected error occurred.',
          original: err,
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header - Added responsive padding */}
      <header className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 shrink-0">
        {/* Left side - Logo/Title */}
        <div className="flex items-center gap-2">
          {/* Placeholder for a potential logo SVG */}
          <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
          <h1 className="text-lg font-semibold">SuperGrok</h1>
        </div>
        {/* Right side - Actions/User Icon Placeholder */}
        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full"></div> {/* Placeholder user icon */}
      </header>

      {/* Chat Area - Constrained width and centered */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col space-y-4 w-full max-w-4xl mx-auto">
        <ChatThread messages={currentMessages} isLoading={isLoading} />
      </main>

      {/* Error Display */}
      {error && (
        <div className="p-2 text-center text-red-600 bg-red-100 border-t border-red-200">
          Error: {error.message} (Type: {error.type})
        </div>
      )}

      {/* Chat Input Wrapper - Constrained width */}
      <div className="w-full max-w-4xl mx-auto">
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </div>
  )
}

function App() {
  return (
    <ConversationProvider>
      <AppContent />
    </ConversationProvider>
  )
}

export default App
