/**
 * LLM Service Configuration
 * Simple configuration for OpenAI and OpenRouter
 */

// Define LLM provider enum
export enum LLMProvider {
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
  // Add other providers as needed
}

// Default configuration settings
export const config = {
  // OpenAI Configuration
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  model: 'gpt-4.1',
  
  // OpenRouter Configuration
  openRouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  openRouterModel: 'openai/gpt-4o', // Default model
  
  // Shared configuration
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: "You are Navi, an AI assistant focused on clarity and conciseness. Provide answers directly using Markdown for formatting (like lists, code blocks, headings). \
For mathematical expressions, STRICTLY follow these rules: \
1. ONLY use valid LaTeX syntax. Ensure the LaTeX code is renderable by standard tools like KaTeX. \
2. Wrap inline math ONLY with single dollar signs ($...$). Example: $E=mc^2$. Do NOT output a new line after or beforethe single dollar signs. \
3. Wrap display (block) math ONLY with double dollar signs ($$...$$). Ensure the double dollar signs are on their OWN lines, with the LaTeX content between them. Example: \
$$ \
 \int_a^b f(x) dx \
 $$ \
4. NEVER output raw, undelimited math expressions or use HTML <math> tags. \
Avoid conversational filler.",

  // Current active provider
  activeProvider: LLMProvider.OPENAI,
}; 