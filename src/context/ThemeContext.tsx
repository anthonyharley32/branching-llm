import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

// Helper function to update dark mode highlight color with transparency
const updateDarkModeHighlightColor = () => {
  const currentColor = getComputedStyle(document.documentElement).getPropertyValue('--branch-highlight-color').trim();
  if (currentColor && currentColor !== '') {
    // Convert hex to RGB with transparency
    const rgb = currentColor.replace('#', '').match(/\w\w/g);
    if (rgb) {
      const [r, g, b] = rgb.map(hex => parseInt(hex, 16));
      document.documentElement.style.setProperty('--branch-highlight-color-dark', `rgba(${r}, ${g}, ${b}, 0.4)`);
    }
  }
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      return savedTheme;
    }
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    return 'light';
  });

  const setTheme = (newTheme: Theme) => {
    console.log('Setting theme to:', newTheme);
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Apply or remove dark class from document
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      console.log('Added dark class to document element');
    } else {
      document.documentElement.classList.remove('dark');
      console.log('Removed dark class from document element');
    }
    
    // Update dark mode highlight color when theme changes
    updateDarkModeHighlightColor();
    
    console.log('Document element classes:', document.documentElement.className);
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Apply theme on initial load
  useEffect(() => {
    console.log('Theme effect triggered with theme:', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      console.log('Applied dark class on initial load');
    } else {
      document.documentElement.classList.remove('dark');
      console.log('Applied light class on initial load');
    }
    
    // Ensure dark mode highlight color is properly set
    updateDarkModeHighlightColor();
    
    console.log('Document element classes after effect:', document.documentElement.className);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (event: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a preference
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const value = {
    theme,
    toggleTheme,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}; 