import React, { useState, useEffect } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi'; // Import sparkles icon
import { 
  getActiveProvider, 
  setProvider, 
  getCurrentModel, 
  setModel, 
  getAllModels,
  ModelInfo
} from '../services/llm';
import { supabase } from '../lib/supabase'; // Import supabase client
import { useAuth } from '../context/AuthContext'; // Import auth context

// Types for backend data
interface SubscriptionTierFeatures {
  tier_name: string;
  tier_slug: string;
  tier_level: number;
  daily_message_limit: number | null;
  features: {
    [key: string]: any;
  };
  status: string;
}

interface AvailableModel {
  model_id: string;
  model_name: string;
  company: string;
  api_model_id: string;
  is_reasoning: boolean;
  description: string;
  minimum_tier_level?: number;
}

interface LLMSettingsProps {
  subscriptionTier?: string;
}

const LLMSettings: React.FC<LLMSettingsProps> = ({ subscriptionTier = 'free' }) => {
  const { user } = useAuth(); // Get current user
  const [allModels, setAllModels] = useState<AvailableModel[]>([]);
  const [availableModelIds, setAvailableModelIds] = useState<Set<string>>(new Set());
  const [filteredModels, setFilteredModels] = useState<AvailableModel[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedModelDesc, setSelectedModelDesc] = useState<string | null>(null);
  const [subscriptionFeatures, setSubscriptionFeatures] = useState<SubscriptionTierFeatures | null>(null);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);

  // Fetch subscription tier features from backend
  const fetchSubscriptionFeatures = async () => {
    setIsLoadingFeatures(true);
    try {
      if (!user?.id) {
        // Handle non-authenticated users - get default tier based on subscriptionTier prop
        const tierSlug = subscriptionTier === 'no-login' ? 'no-login' : 'free';
        const { data, error } = await supabase
          .from('subscription_tiers')
          .select('name, slug, tier_level, daily_message_limit, features')
          .eq('slug', tierSlug)
          .single();

        if (error) throw error;

        if (data) {
          const fallbackFeatures: SubscriptionTierFeatures = {
            tier_name: data.name,
            tier_slug: data.slug,
            tier_level: data.tier_level,
            daily_message_limit: data.daily_message_limit,
            features: data.features,
            status: 'none'
          };
          setSubscriptionFeatures(fallbackFeatures);
        }
      } else {
        // Authenticated user - use RPC function
        const { data, error } = await supabase.rpc('get_user_subscription_tier', {
          user_uuid: user.id
        });

        if (error) {
          console.error('Error fetching subscription features:', error);
          throw error;
        }

        if (data && data.length > 0) {
          setSubscriptionFeatures(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch subscription features:', error);
      setErrorMessage('Failed to load subscription features. Using default settings.');
      
      // Fallback to free tier features on error
      const fallbackFeatures: SubscriptionTierFeatures = {
        tier_name: 'Free',
        tier_slug: 'free',
        tier_level: 1,
        daily_message_limit: 20,
        features: {},
        status: 'none'
      };
      setSubscriptionFeatures(fallbackFeatures);
    } finally {
      setIsLoadingFeatures(false);
    }
  };

    // Fetch all models and determine which ones are available to the user
  const fetchModelsAndAvailability = async () => {
    try {
      // First, get all models
      const { data: allModelsData, error: modelsError } = await supabase
        .from('models')
        .select(`
          id,
          name,
          company,
          api_model_id,
          is_reasoning,
          description,
          minimum_tier:subscription_tiers(tier_level)
        `)
        .eq('is_active', true)
        .order('company', { ascending: true });

      if (modelsError) throw modelsError;

      const formattedModels = allModelsData?.map(model => ({
        model_id: model.id,
        model_name: model.name,
        company: model.company,
        api_model_id: model.api_model_id,
        is_reasoning: model.is_reasoning,
        description: model.description,
        minimum_tier_level: (model.minimum_tier as any)?.tier_level || 0
      })) || [];

      setAllModels(formattedModels);

      // Now determine which models are available to the user
      let userTierLevel = 1; // Default to free tier

      if (!user?.id) {
        // For non-authenticated users, get tier level
        const tierSlug = subscriptionTier === 'no-login' ? 'no-login' : 'free';
        const { data: tierData } = await supabase
          .from('subscription_tiers')
          .select('tier_level')
          .eq('slug', tierSlug)
          .single();

        userTierLevel = tierData?.tier_level || 1;
      } else {
        // For authenticated users, get their subscription tier level
        const { data: tierData } = await supabase.rpc('get_user_subscription_tier', {
          user_uuid: user.id
        });

        if (tierData && tierData.length > 0) {
          userTierLevel = tierData[0].tier_level || 1;
        }
      }

      // Create set of available model IDs
      const availableIds = new Set(
        formattedModels
          .filter(model => model.minimum_tier_level <= userTierLevel)
          .map(model => model.api_model_id)
      );

      setAvailableModelIds(availableIds);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setErrorMessage('Failed to load models.');
    }
  };

    // Check if a model is available to the user
  const isModelAvailable = (modelId: string): boolean => {
    return availableModelIds.has(modelId);
  };

  // Load subscription features and models
  useEffect(() => {
    const loadData = async () => {
      await fetchSubscriptionFeatures();
      await fetchModelsAndAvailability();
    };
    loadData();
  }, [user?.id, subscriptionTier]);

  // Load current model from LLM service  
  useEffect(() => {
    const loadCurrentModel = () => {
      const provider = getActiveProvider();
      const currentModelString = getCurrentModel();
      
      // Try to find matching model in all models
      const currentModel = allModels.find(model => 
        model.api_model_id === currentModelString
      );
      
      if (currentModel && isModelAvailable(currentModel.api_model_id)) {
        setCurrentModelId(currentModel.api_model_id);
        setSelectedModelDesc(currentModel.description || null);
      } else if (availableModelIds.size > 0) {
        // Default to first available model if current model not found or not available
        const firstAvailableModel = allModels.find(model => availableModelIds.has(model.api_model_id));
        if (firstAvailableModel) {
          setCurrentModelId(firstAvailableModel.api_model_id);
          setSelectedModelDesc(firstAvailableModel.description || null);
        }
      }
    };
    
    if (allModels.length > 0) {
      loadCurrentModel();
    }
  }, [allModels, availableModelIds]);

  // Filter models based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredModels(allModels);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = allModels.filter(
      model => 
        model.model_name.toLowerCase().includes(query) || 
        model.company.toLowerCase().includes(query)
    );
    
    setFilteredModels(filtered);
  }, [searchQuery, allModels]);

  // Handle model change
  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    setIsUpdating(true);
    setErrorMessage(null);
    
    // Check if model is available
    if (!isModelAvailable(modelId)) {
      setErrorMessage('This model is not available with your current subscription. Please upgrade to access this model.');
      setIsUpdating(false);
      return;
    }
    
    setCurrentModelId(modelId);
    
    try {
              // Find the selected model
        const selectedModel = allModels.find(model => model.api_model_id === modelId);
      
      if (selectedModel) {
        // All models are routed through OpenRouter
        const { LLMProvider } = await import('../services/llm');
        
        // Set provider if different from current (all models use OpenRouter)
        if (getActiveProvider() !== LLMProvider.OPENROUTER) {
          setProvider(LLMProvider.OPENROUTER);
        }
        
        // Set the model
        setModel(selectedModel.api_model_id);
        setSelectedModelDesc(selectedModel.description || null);
        
        // Save preference to user profile if user is logged in
        if (user) {
          const { data: currentProfileData } = await supabase
            .from('user_profiles')
            .select('preferences')
            .eq('user_id', user.id)
            .single();
          
          const updatedPreferences = {
            ...(currentProfileData?.preferences || {}),
            preferredModel: modelId
          };
          
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ preferences: updatedPreferences })
            .eq('user_id', user.id);
          
          if (updateError) {
            console.error('Error saving model preference:', updateError);
          }
        }
        
        setIsUpdating(false);
      } else {
        throw new Error('Selected model not found');
      }
    } catch (error) {
      console.error('Failed to change model:', error);
      setErrorMessage(`Failed to change model: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsUpdating(false);
    }
  };

  // Get provider logo based on company name
  const getProviderLogo = (company: string): string => {
    switch (company.toLowerCase()) {
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      {errorMessage && (
        <div className="mb-4 p-2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 rounded">
          {errorMessage}
        </div>
      )}
      
      <div className="relative mb-4">
        <div className="flex items-center border border-blue-200 dark:border-blue-700 rounded-md overflow-hidden bg-blue-50 dark:bg-blue-900/20 p-2">
          <div className="flex-shrink-0 pl-1 text-blue-500 dark:text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search models by name or provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-grow py-2 px-3 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="flex-shrink-0 pr-2 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="mb-4">
        {/* Currently selected model indicator */}
        {currentModelId && (
          <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Current Model:</div>
              <div className="flex items-center gap-1.5 flex-grow">
                {(() => {
                  const selectedModel = allModels.find(m => m.api_model_id === currentModelId);
                  if (selectedModel) {
                    return (
                      <>
                        <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                          {getProviderLogo(selectedModel.company) && (
                            <img 
                              src={getProviderLogo(selectedModel.company)} 
                              alt={`${selectedModel.company} logo`} 
                              className="max-w-full max-h-full"
                            />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                            <span>{selectedModel.model_name}</span>
                            {selectedModel.is_reasoning && (
                              <span className="flex items-center text-xs text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                                <HiOutlineSparkles className="mr-1" /> 
                                Reasoning
                              </span>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
            {/* Show description inline */}
            {selectedModelDesc && (
              <div className="text-xs text-gray-600 dark:text-gray-300 pl-1 pt-1">
                {selectedModelDesc}
                {currentModelId.startsWith('x-ai/grok-') && (
                  <span className="block mt-1 text-blue-600 dark:text-blue-400">
                    <strong>Note:</strong> Shows thinking process and requires special handling (configured automatically).
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            Select Model
          </label>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isLoadingFeatures ? 'Loading subscription info...' : 
             subscriptionFeatures ? `${subscriptionFeatures.tier_name}: ${
               availableModelIds.size === 1 ? 
                 `${Array.from(availableModelIds)[0]} only` :
                 subscriptionFeatures.tier_slug === 'unlimited' ? 'All models' :
                 `${availableModelIds.size} models available`
             }` : ''}
          </div>
        </div>
        
        <div className="relative">
          <select
            value={currentModelId}
            onChange={handleModelChange}
            disabled={isUpdating}
            className="sr-only"
          >
            {filteredModels.map((model) => (
              <option key={model.model_id} value={model.api_model_id}>
                {model.model_name} - {model.company}
              </option>
            ))}
          </select>
        </div>
        
        {/* Custom visual model list */}
        <div className="border border-gray-200 dark:border-gray-600 rounded-md overflow-hidden max-h-64 overflow-y-auto">
          {isLoadingFeatures ? (
            <div className="p-3 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">
              Loading subscription features...
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="p-3 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">
              No models found matching your search
            </div>
          ) : (
            filteredModels.map((model: AvailableModel) => {
              const isAvailable = isModelAvailable(model.api_model_id);
              return (
                <div 
                  key={model.model_id}
                  onClick={() => {
                    if (!isUpdating && !isLoadingFeatures && isAvailable) {
                      setCurrentModelId(model.api_model_id);
                      handleModelChange({ target: { value: model.api_model_id } } as React.ChangeEvent<HTMLSelectElement>);
                    }
                  }}
                  className={`flex items-center gap-2 p-2 ${
                    isAvailable && !isLoadingFeatures
                      ? `hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                          currentModelId === model.api_model_id ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-white dark:bg-gray-800'
                        }`
                      : 'bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed opacity-50'
                  }`}
                  title={isLoadingFeatures ? "Loading subscription features..." : model.description}
                >
                <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                  {getProviderLogo(model.company) && (
                    <img 
                      src={getProviderLogo(model.company)} 
                      alt={`${model.company} logo`} 
                      className="max-w-full max-h-full"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                    <span>{model.model_name}</span>
                    {model.is_reasoning && (
                      <span className="flex items-center text-xs text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                        <HiOutlineSparkles className="mr-1" /> 
                        Reasoning
                      </span>
                    )}
                    {!isAvailable && (
                      <span className="flex items-center text-xs text-orange-600 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-full">
                        Upgrade Required
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{model.company}</div>
                </div>
                {currentModelId === model.api_model_id && isAvailable && (
                  <div className="flex-shrink-0 text-blue-500 dark:text-blue-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            );
            })
          )}
        </div>
        
        <div className="mt-4 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Powered by
          </div>
          <div className="flex justify-center flex-wrap gap-3">
            {Array.from(new Set(allModels.map((model: AvailableModel) => model.company))).map((company: string) => (
              <div key={company} className="flex items-center gap-1.5">
                {getProviderLogo(company) && (
                  <img src={getProviderLogo(company)} alt={`${company} logo`} className="w-5 h-5" />
                )}
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{company}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LLMSettings; 