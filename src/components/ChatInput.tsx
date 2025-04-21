import React, { useState, KeyboardEvent, FormEvent, useRef } from 'react';
import { IoMdMic, IoMdArrowUp, IoMdAttach, IoMdClose } from 'react-icons/io';

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

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newImages: ImageData[] = [];
    
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

  return (
    <div className="flex flex-col mx-4 mb-4">
      {/* Selected images preview */}
      {selectedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 mb-2 border border-gray-200 rounded-lg bg-white">
          {selectedImages.map((img, index) => (
            <div key={index} className="relative group">
              <img 
                src={img.url} 
                alt={`Selected ${index}`} 
                className="h-20 w-20 object-cover rounded"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 bg-gray-800 bg-opacity-70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <IoMdClose size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form 
        onSubmit={handleSubmit} 
        className="flex items-end p-3 border border-gray-200 rounded-2xl bg-white shadow-md transition-all hover:shadow-lg"
      >
        <button 
          type="button" 
          className="p-2 text-gray-500 hover:text-gray-700 flex-shrink-0"
        >
          <IoMdMic size={20} />
        </button>

        <button 
          type="button" 
          onClick={handleAttachClick}
          className="p-2 mr-2 text-gray-500 hover:text-gray-700 flex-shrink-0"
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
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="How can Navi help?"
          disabled={isLoading}
          className="flex-grow px-3 py-2 bg-transparent border-none focus:outline-none focus:ring-0 resize-none max-h-40 overflow-y-auto text-sm"
          rows={1}
        />

        <button
          type="submit"
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className="p-2 ml-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <IoMdArrowUp size={20} />
        </button>
      </form>
    </div>
  );
};

export default ChatInput; 