import React, { useEffect, useState } from 'react';

// Track if any content has been received
useEffect(() => {
  console.log('ThinkingBox useEffect - Content update:', 
    thinkingContent ? `${thinkingContent.length} chars` : '0 chars', 
    'isThinkingComplete:', isThinkingComplete);
  
  if (thinkingContent && thinkingContent.trim().length > 0) {
    setHasContent(true);
    console.log('ThinkingBox - hasContent set to true, content preview:', 
               thinkingContent.substring(0, 30) + '...');
  }
}, [thinkingContent, isThinkingComplete]);

// Don't render anything if thinking is complete AND no content was ever received
if (isThinkingComplete && !hasContent) {
  console.log('ThinkingBox - Not rendering: thinking complete and no content');
  return null;
}

console.log('ThinkingBox - Rendering thinking box:', 
           'isExpanded:', isExpanded, 
           'isThinkingComplete:', isThinkingComplete, 
           'hasContent:', hasContent); 