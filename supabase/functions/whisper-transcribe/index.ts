import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// OpenAI API base URL
const OPENAI_API_URL = 'https://api.openai.com/v1'

// Get the OpenAI API key from environment variable
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

console.log('Whisper transcription function handler started.');

serve(async (req) => {
  console.log(`Received request: ${req.method} ${req.url}`);

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key is missing!');
      throw new Error('OpenAI API key is not configured in the environment')
    }

    // Parse the form data
    const formData = await req.formData();
    const audioFile = formData.get('file') as File;
    const model = formData.get('model') as string || 'whisper-1';
    const language = formData.get('language') as string;

    if (!audioFile) {
      throw new Error('No audio file provided');
    }

    console.log('Transcribing audio file:', {
      name: audioFile.name,
      size: audioFile.size,
      type: audioFile.type,
      model: model
    });

    // Create FormData for OpenAI API
    const openaiFormData = new FormData();
    openaiFormData.append('file', audioFile);
    openaiFormData.append('model', model);
    if (language) {
      openaiFormData.append('language', language);
    }

    // Call OpenAI Whisper API
    const response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: openaiFormData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`OpenAI Error: ${response.status} ${errorBody}`);
      throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
    }

    const result = await response.json();
    console.log('Transcription successful');

    return new Response(
      JSON.stringify({ text: result.text }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error: any) {
    console.error('Error in whisper transcription:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to transcribe audio' 
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 500 
      }
    );
  }
}); 