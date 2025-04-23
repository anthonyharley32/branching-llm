import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { Session, User, Provider, SignInWithPasswordCredentials, SignUpWithPasswordCredentials } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase'; // Import your initialized Supabase client
import { loadUserModelPreference } from '../services/llm'; // Import the new function

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: Provider) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load user model preference when user changes
  useEffect(() => {
    if (user) {
      // Load the user's preferred model asynchronously
      loadUserModelPreference(user.id).catch(err => {
        console.error('Error loading user model preference:', err);
      });
    }
  }, [user]);

  useEffect(() => {
    setIsLoading(true);
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // If user is logged in, load their model preference
      if (session?.user) {
        loadUserModelPreference(session.user.id).catch(err => {
          console.error('Error loading user model preference on initial session:', err);
        });
      }
      
      setIsLoading(false);
    }).catch(error => {
        console.error("Error getting initial session:", error);
        setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // If a user has logged in or token refreshed, load their model preference
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          loadUserModelPreference(session.user.id).catch(err => {
            console.error(`Error loading user model preference on ${event}:`, err);
          });
        }
        
        setIsLoading(false); // Ensure loading is false after state change
      }
    );

    // Cleanup listener on unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      // Optionally handle error state here
    }
    // State will update via onAuthStateChange listener
    // setIsLoading(false); // Handled by listener now
  };

  const signInWithPassword = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false); // Set loading false after attempt
    if (error) {
      console.error('Error signing in:', error);
      throw error; // Re-throw the error to be caught in the UI component
    }
    // State will update via onAuthStateChange listener
  };
  
  const signUp = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({ 
        email, 
        password, 
        // Optional: Add options like redirect URL if needed for email verification flow
        options: {
            emailRedirectTo: window.location.origin, // Redirect back to app after verification
        }
    });
    setIsLoading(false);
    if (error) {
      console.error('Error signing up:', error);
      throw error;
    }
    // State will update via onAuthStateChange listener (usually requires email verification first)
    // You might want to show a message in the UI after calling this
  };
  
  const signInWithProvider = async (provider: Provider): Promise<void> => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ 
        provider,
        options: {
            // Optional: Specify redirect URL if needed, defaults usually work
             redirectTo: window.location.origin, 
        }
     });
    // Don't setLoading(false) here, as redirect will happen
    if (error) {
        console.error(`Error signing in with ${provider}:`, error);
        setIsLoading(false); // Only set loading false if there's an error preventing redirect
        throw error;
    }
    // Supabase handles the redirect
  };

  const value = {
    session,
    user,
    isLoading,
    signOut,
    signInWithPassword,
    signUp,
    signInWithProvider,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 