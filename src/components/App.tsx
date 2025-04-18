import React, { useEffect } from 'react';

function App() {
  // Initialize custom styling from saved preferences
  useEffect(() => {
    // Initialize highlight color from localStorage if available
    const savedHighlightColor = localStorage.getItem('branchHighlightColor');
    if (savedHighlightColor) {
      document.documentElement.style.setProperty('--branch-highlight-color', savedHighlightColor);
    }
  }, []);

  // ... rest of App component ...
}

export default App; 