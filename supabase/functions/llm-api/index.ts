import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

// OpenRouter API base URL
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'

// Get the API key from environment variable
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

console.log('Function handler started.');

serve(async (req) => {
  console.log(`Received request: ${req.method} ${req.url}`);

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Attempting to parse request body...');
    const body = await req.json();
    console.log('Request body parsed:', body);
    const { endpoint, payload } = body;

    if (!OPENROUTER_API_KEY) {
      console.error('OpenRouter API key is missing!');
      throw new Error('OpenRouter API key is not configured in the environment')
    }
    console.log('API key found.');

    // Only allow specific endpoints
    const allowedEndpoints = ['chat/completions']
    if (!allowedEndpoints.includes(endpoint)) {
      console.error(`Endpoint not allowed: ${endpoint}`);
      throw new Error(`Endpoint not allowed: ${endpoint}`)
    }
    console.log(`Endpoint ${endpoint} is allowed.`);

    console.log('Forwarding request to OpenRouter...');
    // Forward the request to OpenRouter
    const response = await fetch(`${OPENROUTER_API_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.get('origin') || 'https://learningllm.app', 
        'X-Title': 'Learning LLM App'
      },
      body: JSON.stringify(payload),
    })
    console.log(`OpenRouter response status: ${response.status}`);

    // Check if OpenRouter request was successful
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`OpenRouter Error: ${response.status} ${errorBody}`);
        throw new Error(`OpenRouter API error: ${response.status} - ${errorBody}`);
    }

    // Get the response data
    const contentType = response.headers.get('content-type');
    console.log(`OpenRouter response content type: ${contentType}`);
    
    // If it's a streaming response, handle it directly
    if (payload.stream) {
      console.log('Handling streaming response.');
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    console.log('Handling non-streaming response.');
    // Handle non-streaming JSON response
    const responseData = contentType?.includes('application/json')
      ? await response.json()
      : await response.text()
    console.log('Received non-streaming data from OpenRouter.');

    // Return the response
    return new Response(
      JSON.stringify(responseData),
      { 
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  } catch (error) {
    console.error('Error caught in function handler:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, // Keep 400 for now, but the logs will tell us more
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
}) 