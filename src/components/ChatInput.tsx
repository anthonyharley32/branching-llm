import React, { useState, KeyboardEvent, FormEvent, useRef, useEffect } from 'react';
import { IoMdMic, IoMdArrowUp, IoMdAttach, IoMdClose, IoMdSquare } from 'react-icons/io';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

interface ChatInputProps {
  onSendMessage: (message: string, images?: string[]) => void;
  isLoading: boolean;
}

interface ImageData {
  url: string;
  file: File;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedImages, setSelectedImages] = useState<ImageData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Voice recording functionality
  const {
    isRecording,
    isTranscribing,
    audioLevel,
    error: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording();

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight to fit content
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputValue]);

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const message = inputValue.trim();
    
    if ((message || selectedImages.length > 0) && !isLoading) {
      // Convert images to base64 strings
      const imageBase64Strings = selectedImages.map(img => img.url);
      
      // Send the message with images if any
      onSendMessage(message, imageBase64Strings.length > 0 ? imageBase64Strings : undefined);
      
      // Clear the input and selected images
      setInputValue('');
      setSelectedImages([]);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Process each selected file
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const imageUrl = e.target.result as string;
          setSelectedImages(prev => [...prev, { url: imageUrl, file }]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Clear the input value so the same file can be selected again
    event.target.value = '';
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    
    // Check if any clipboard item is an image
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the item is an image
      if (item.type.indexOf('image') !== -1) {
        // Get the image as a file
        const file = item.getAsFile();
        
        if (file) {
          // Convert the file to a data URL
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              const imageUrl = e.target.result as string;
              setSelectedImages(prev => [...prev, { url: imageUrl, file }]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Handle voice recording
  const handleVoiceRecording = async () => {
    if (isRecording) {
      // Stop recording and get transcription
      const transcription = await stopRecording();
      if (transcription) {
        // Add transcription to input
        setInputValue(prev => prev + (prev ? ' ' : '') + transcription);
        // Focus back to textarea
        textareaRef.current?.focus();
      }
    } else {
      // Start recording
      await startRecording();
    }
  };

  // Handle voice recording cancellation on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isRecording) {
        cancelRecording();
      }
    };

    document.addEventListener('keydown', handleKeyDown as any);
    return () => document.removeEventListener('keydown', handleKeyDown as any);
  }, [isRecording, cancelRecording]);

  return (
    <div className="flex flex-col mx-4 mb-4">
      {/* Voice error message */}
      {voiceError && (
        <div className="mb-2 p-2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 rounded text-sm">
          {voiceError}
        </div>
      )}

      {/* Voice recording status */}
      {(isRecording || isTranscribing) && (
        <div className="mb-2 p-3 border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-center gap-2">
            {isRecording && (
              <>
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-blue-700 dark:text-blue-300">Recording... (Press Escape to cancel)</span>
                {audioLevel > 0 && (
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 ml-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-100"
                      style={{ width: `${Math.min(audioLevel / 50 * 100, 100)}%` }}
                    ></div>
                  </div>
                )}
              </>
            )}
            {isTranscribing && (
              <>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-spin border-2 border-white border-t-transparent"></div>
                <span className="text-sm text-blue-700 dark:text-blue-300">Processing audio...</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Selected images preview */}
      {selectedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 mb-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          {selectedImages.map((img, index) => (
            <div key={index} className="relative group">
              <img 
                src={img.url} 
                alt={`Selected ${index}`} 
                className="h-20 w-20 object-cover rounded"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 bg-gray-800 bg-opacity-70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <IoMdClose size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form 
        onSubmit={handleSubmit} 
        className="flex items-end p-3 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 shadow-md transition-all hover:shadow-lg"
      >
        <button 
          type="button" 
          onClick={handleVoiceRecording}
          disabled={isLoading || isTranscribing}
          className={`p-2 flex-shrink-0 cursor-pointer transition-colors ${
            isRecording 
              ? 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isRecording ? 'Stop recording' : 'Start voice recording'}
        >
          {isRecording ? <IoMdSquare size={20} /> : <IoMdMic size={20} />}
        </button>

        <button 
          type="button" 
          onClick={handleAttachClick}
          className="p-2 mr-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0 cursor-pointer"
        >
          <IoMdAttach size={20} />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />
        </button>

        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="How can Navi help?"
          disabled={isLoading}
          className="flex-grow px-3 py-2 bg-transparent border-none focus:outline-none focus:ring-0 resize-none overflow-hidden text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          rows={1}
          style={{ minHeight: '2.5rem', maxHeight: '12rem' }}
        />

        <button
          type="submit"
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className="p-2 ml-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
        >
          <IoMdArrowUp size={20} />
        </button>
      </form>
    </div>
  );
};

export default ChatInput; 