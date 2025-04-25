import { supabase } from '../lib/supabase';
import { Conversation as FrontendConversation, MessageNode } from '../types/conversation';
import { Conversation as DbConversation, ConversationMessage as DbMessage } from '../types/database'; // Assuming database types are defined

/**
 * Loads the most recent conversation for a given user from Supabase.
 * Converts the database representation to the frontend format.
 *
 * @param userId The ID of the user whose conversation to load.
 * @returns The user's conversation in frontend format, or null if not found or error.
 */
export const loadConversationFromSupabase = async (userId: string): Promise<FrontendConversation | null> => {
  try {
    // 1. Fetch the latest conversation metadata for the user
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }) // Get the most recently updated
      .limit(1)
      .maybeSingle(); // Use maybeSingle to return null if no conversation found

    if (convError) {
      console.error('Error fetching conversation:', convError);
      return null;
    }

    if (!convData) {
      console.log(`No conversation found for user ${userId}.`);
      return null; // No conversation exists for this user yet
    }

    const dbConversation = convData as DbConversation;

    // 2. Fetch all messages for that conversation
    const { data: messagesData, error: messagesError } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', dbConversation.id);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      // Decide if we should return partial data or null. Returning null for now.
      return null;
    }

    const dbMessages = (messagesData || []) as DbMessage[];

    // 3. Convert DB messages to frontend MessageNode format
    const frontendMessages: Record<string, MessageNode> = {};
    for (const dbMsg of dbMessages) {
      // Basic mapping - adjust as needed based on type differences
      frontendMessages[dbMsg.id] = {
        id: dbMsg.id,
        role: dbMsg.role as 'user' | 'assistant' | 'system', // Add type assertion
        content: dbMsg.content,
        createdAt: new Date(dbMsg.created_at), // Convert ISO string to Date
        parentId: dbMsg.parent_message_id,
        thinkingContent: dbMsg.thinking_content || undefined, // Load thinking content from database
        // Map any other relevant fields from dbMsg.metadata if needed
         metadata: dbMsg.metadata || {}, // Ensure metadata is at least an empty object
      };
    }

    // 4. Construct the frontend Conversation object
    const frontendConversation: FrontendConversation = {
      id: dbConversation.id,
      rootMessageId: dbConversation.root_message_id, // Assuming this is stored correctly
      messages: frontendMessages,
      createdAt: new Date(dbConversation.created_at).getTime(), // Convert to timestamp
      updatedAt: dbConversation.updated_at ? new Date(dbConversation.updated_at).getTime() : undefined,
      userId: dbConversation.user_id,
      // Add the title from database
      title: dbConversation.title || 'New Chat',
    };

    return frontendConversation;

  } catch (error) {
    console.error('Unexpected error loading conversation from Supabase:', error);
    return null;
  }
};

/**
 * Saves the entire conversation state (metadata and all messages) to Supabase.
 * This performs an "upsert" operation: updates existing messages/conversation record
 * or inserts new ones based on their IDs.
 *
 * @param conversation The conversation state in frontend format.
 * @returns True if successful, false otherwise.
 */
export const saveConversationToSupabase = async (conversation: FrontendConversation): Promise<boolean> => {
  if (!conversation.userId) {
      console.error("Cannot save conversation without a userId.");
      return false;
  }

  try {
    // 1. Prepare conversation metadata for upsert
    const conversationForDb: Partial<DbConversation> = {
      id: conversation.id, // Use the existing ID for upsert
      user_id: conversation.userId,
      root_message_id: conversation.rootMessageId,
      // Don't override existing title with a default value
      title: conversation.title || 'New Chat',
      // Keep created_at if it exists in the conversation object
      created_at: conversation.createdAt ? new Date(conversation.createdAt).toISOString() : undefined,
      updated_at: new Date().toISOString(), // Ensure updated_at is set
    };

    const { error: convUpsertError } = await supabase
        .from('conversations')
        .upsert(conversationForDb, { onConflict: 'id' }); // Upsert based on conversation ID

    if (convUpsertError) {
        console.error('Error upserting conversation metadata:', convUpsertError);
        return false; // Stop if conversation metadata fails
    }

    // Log how many messages have thinking content
    const messagesWithThinking = Object.values(conversation.messages).filter(node => node.thinkingContent).length;
    console.log(`Saving conversation: ${messagesWithThinking} assistant messages have thinking content`);
    
    // Debug: log all assistant messages to check thinking content
    console.log('DEBUG - Assistant messages thinking content status:');
    Object.values(conversation.messages)
      .filter(node => node.role === 'assistant')
      .forEach(node => {
        console.log(`Message ${node.id}: ${node.thinkingContent ? 'Has thinking (' + node.thinkingContent.length + ' chars)' : 'NO thinking content'}`);
      });

    // 2. Prepare messages for upsert
    const messagesForDb: Partial<DbMessage>[] = Object.values(conversation.messages).map(node => {
        // Log thinking content existence for assistant messages
        if (node.role === 'assistant') {
          if (node.thinkingContent) {
            console.log(`Assistant message ${node.id} has thinking content: ${node.thinkingContent.length} characters`);
            // Add a sample of thinking content for debugging
            console.log(`Sample: ${node.thinkingContent.substring(0, 100)}...`);
          } else {
            console.log(`Assistant message ${node.id} has NO thinking content`);
          }
        }
        
        // Debug: log the actual value being saved to DB
        const thinkingContentForDb = node.thinkingContent || null;
        if (node.role === 'assistant') {
          console.log(`DB value for thinking_content for ${node.id}: ${thinkingContentForDb ? 'Present' : 'NULL'}`);
        }
        
        return {
          id: node.id, // Use existing ID for upsert
          conversation_id: conversation.id,
          parent_message_id: node.parentId,
          role: node.role,
          content: node.content,
          metadata: node.metadata || {},
          thinking_content: thinkingContentForDb, // Add thinking content to database save
          // Ensure dates are ISO strings for Supabase
          created_at: node.createdAt instanceof Date ? node.createdAt.toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
    });

    if (messagesForDb.length > 0) {
        // First, log the messages we're about to save
        const assistantMessagesWithThinking = messagesForDb.filter(
            msg => msg.role === 'assistant' && msg.thinking_content
        );
        console.log(`About to save ${assistantMessagesWithThinking.length} messages with thinking content`);
        
        // Perform the database upsert without returning
        const { error: messagesUpsertError } = await supabase
            .from('conversation_messages')
            .upsert(messagesForDb, { onConflict: 'id' }); // Upsert based on message ID

        if (messagesUpsertError) {
            console.error('Error upserting messages:', messagesUpsertError);
            return false;
        }
        
        // Log success
        console.log(`Database save completed successfully`);
        console.log(`Thinking content status summary: ${assistantMessagesWithThinking.length} messages had thinking content`);
        
        // Optionally verify with a separate query
        try {
          const { data: verifyData, error: verifyError } = await supabase
              .from('conversation_messages')
              .select('id, role, thinking_content')
              .eq('conversation_id', conversation.id)
              .eq('role', 'assistant');
              
          if (!verifyError && verifyData) {
              const messagesWithThinkingInDb = verifyData.filter(msg => msg.thinking_content !== null);
              console.log(`Verification: ${messagesWithThinkingInDb.length} assistant messages have thinking content in DB`);
          }
        } catch (verifyError) {
          console.error('Error verifying thinking content in DB:', verifyError);
        }
    }

    return true; // Success

  } catch (error) {
    console.error('Unexpected error saving conversation to Supabase:', error);
    return false;
  }
}; 