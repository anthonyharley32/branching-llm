import React, { useState, useEffect } from 'react';
import { 
  getActiveProvider, 
  setProvider, 
  getCurrentModel, 
  setModel, 
  LLMProvider,
  getAllModels,
  ModelInfo
} from '../services/llm';

interface LLMSettingsProps {
  onClose?: () => void;
}

// Model description mapping
const MODEL_DESCRIPTIONS: Record<string, string> = {
  'x-ai/grok-3-mini-beta': 'A lightweight, thinking model ideal for reasoning-heavy tasks that need less domain knowledge. Excels at math and solving puzzles.',
  'x-ai/grok-3-beta': 'Full-sized thinking model with strong reasoning capabilities and wide knowledge. Shows its thinking process in responses.',
  'anthropic/claude-3.7-sonnet:thinking': 'Claude 3.7 Sonnet with step-by-step reasoning visible in the response.',
  'anthropic/claude-3.7-sonnet': 'Anthropic\'s balanced model with strong reasoning and instruction following capabilities.',
  'openai/gpt-4.1': 'OpenAI\'s most capable model for complex tasks requiring deep understanding.',
  'openai/o4-mini-high': 'Smaller, faster version of GPT-4.1 optimized for responsive interactions.',
  'google/gemini-2.5-flash-preview': 'Google\'s fastest Gemini model for responsive applications.',
  'google/gemini-2.5-pro-preview-03-25': 'Google\'s most capable Gemini model for complex reasoning tasks.'
};

const LLMSettings: React.FC<LLMSettingsProps> = ({ onClose }) => {
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [filteredModels, setFilteredModels] = useState<ModelInfo[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedModelDesc, setSelectedModelDesc] = useState<string | null>(null);

  // Load all models and set current model on initial load
  useEffect(() => {
    const models = getAllModels();
    setAllModels(models);
    setFilteredModels(models);
    
    // Get current model and find its ID in our list
    const provider = getActiveProvider();
    const currentModelString = getCurrentModel();
    
    // Find the matching model in our list
    const currentModel = models.find(model => 
      model.provider === provider && 
      (model.fullId === currentModelString || model.id === currentModelString)
    );
    
    if (currentModel) {
      setCurrentModelId(currentModel.fullId);
      setSelectedModelDesc(MODEL_DESCRIPTIONS[currentModel.fullId] || null);
    }
  }, []);

  // Filter models based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredModels(allModels);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = allModels.filter(
      model => 
        model.name.toLowerCase().includes(query) || 
        model.providerName.toLowerCase().includes(query)
    );
    
    setFilteredModels(filtered);
  }, [searchQuery, allModels]);

  // Handle model change
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    setCurrentModelId(modelId);
    setIsUpdating(true);
    setErrorMessage(null);
    
    try {
      // Find the selected model
      const selectedModel = allModels.find(model => model.fullId === modelId);
      
      if (selectedModel) {
        // Set provider if different from current
        if (getActiveProvider() !== selectedModel.provider) {
          setProvider(selectedModel.provider);
        }
        
        // Set the model
        setModel(selectedModel.fullId);
        setIsUpdating(false);
        setSelectedModelDesc(MODEL_DESCRIPTIONS[modelId] || null);
      } else {
        throw new Error('Selected model not found');
      }
    } catch (error) {
      console.error('Failed to change model:', error);
      setErrorMessage(`Failed to change model: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsUpdating(false);
    }
  };

  // Get provider logo based on provider name
  const getProviderLogo = (providerName: string): string => {
    switch (providerName.toLowerCase()) {
      case 'openai':
        return '/llmLogos/openai.jpg';
      case 'anthropic':
        return '/llmLogos/claude.jpg';
      case 'meta':
        return '/llmLogos/meta.webp'; 
      case 'google':
        return '/llmLogos/gemini.webp';
      case 'xai':
        return '/llmLogos/grok.webp';
      default:
        return '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      {errorMessage && (
        <div className="mb-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {errorMessage}
        </div>
      )}
      
      <div className="relative mb-4">
        <div className="flex items-center border border-blue-200 rounded-md overflow-hidden bg-blue-50 p-2">
          <div className="flex-shrink-0 pl-1 text-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search models by name or provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-grow py-2 px-3 focus:outline-none bg-transparent"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="flex-shrink-0 pr-2 text-blue-500 hover:text-blue-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="mb-4">
        {/* Currently selected model indicator with inline description */}
        {currentModelId && (
          <div className="mb-2 p-2 bg-gray-50 rounded-md border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-sm font-medium text-gray-700">Current Model:</div>
              <div className="flex items-center gap-1.5 flex-grow">
                {(() => {
                  const selectedModel = allModels.find(m => m.fullId === currentModelId);
                  if (selectedModel) {
                    return (
                      <>
                        <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                          {getProviderLogo(selectedModel.providerName) && (
                            <img 
                              src={getProviderLogo(selectedModel.providerName)} 
                              alt={`${selectedModel.providerName} logo`} 
                              className="max-w-full max-h-full"
                            />
                          )}
                        </div>
                        <span className="font-medium text-gray-900">{selectedModel.name}</span>
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
            {/* Show description inline */}
            {selectedModelDesc && (
              <div className="text-xs text-gray-600 pl-1 pt-1">
                {selectedModelDesc}
                {currentModelId.startsWith('x-ai/grok-') && (
                  <span className="block mt-1 text-blue-600">
                    <strong>Note:</strong> Shows thinking process and requires special handling (configured automatically).
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select Model
        </label>
        <div className="relative">
          <select
            value={currentModelId}
            onChange={handleModelChange}
            disabled={isUpdating}
            className="sr-only"
          >
            {filteredModels.map((model) => (
              <option key={model.fullId} value={model.fullId}>
                {model.name} - {model.providerName}
              </option>
            ))}
          </select>
        </div>
        
        {/* Custom visual model list */}
        <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
          {filteredModels.length === 0 ? (
            <div className="p-3 text-center text-gray-500 bg-white">
              No models found matching your search
            </div>
          ) : (
            filteredModels.map((model) => (
              <div 
                key={model.fullId}
                onClick={() => {
                  if (!isUpdating) {
                    setCurrentModelId(model.fullId);
                    handleModelChange({ target: { value: model.fullId } } as React.ChangeEvent<HTMLSelectElement>);
                  }
                }}
                className={`flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer ${
                  currentModelId === model.fullId ? 'bg-blue-50' : 'bg-white'
                }`}
                title={MODEL_DESCRIPTIONS[model.fullId] || ""}
              >
                <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                  {getProviderLogo(model.providerName) && (
                    <img 
                      src={getProviderLogo(model.providerName)} 
                      alt={`${model.providerName} logo`} 
                      className="max-w-full max-h-full"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800">{model.name}</div>
                  <div className="text-xs text-gray-500">{model.providerName}</div>
                </div>
                {currentModelId === model.fullId && (
                  <div className="flex-shrink-0 text-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        
        <div className="mt-4 text-center">
          <div className="text-xs text-gray-500 mb-2">
            Powered by
          </div>
          <div className="flex justify-center flex-wrap gap-3">
            {Array.from(new Set(allModels.map(model => model.providerName))).map(provider => (
              <div key={provider} className="flex items-center gap-1.5">
                {getProviderLogo(provider) && (
                  <img src={getProviderLogo(provider)} alt={`${provider} logo`} className="w-5 h-5" />
                )}
                <span className="text-xs font-medium text-gray-700">{provider}</span>
              </div>
            ))}
          </div>
        </div>
        
        {onClose && (
          <div className="flex justify-end mt-4">
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded-md text-gray-800 hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LLMSettings; 