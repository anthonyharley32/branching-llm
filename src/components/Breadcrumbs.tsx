import React from 'react';
import { MessageNode } from '../types/conversation';
import { FiChevronRight } from 'react-icons/fi'; // Icon for separator

interface BreadcrumbsProps {
  path: MessageNode[];
  onNavigate: (messageId: string) => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ path, onNavigate }) => {
  if (!path || path.length <= 1) {
    return null; // Don't show breadcrumbs for root or single message
  }

  const getCrumbLabel = (node: MessageNode): string => {
    // Simple label based on role, could be enhanced
    return node.role.charAt(0).toUpperCase() + node.role.slice(1);
    // Alternative: Use first few words? 
    // return node.content.split(' ').slice(0, 3).join(' ') + (node.content.split(' ').length > 3 ? '...' : '');
  };

  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400 overflow-x-auto whitespace-nowrap py-1">
      {path.map((node, index) => (
        <React.Fragment key={node.id}>
          {index > 0 && <FiChevronRight className="h-3 w-3 flex-shrink-0" />}
          {index < path.length - 1 ? (
            // Make previous crumbs clickable
            <button
              onClick={() => onNavigate(node.id)}
              className="hover:underline focus:outline-none focus:underline"
            >
              {getCrumbLabel(node)}
            </button>
          ) : (
            // Last crumb (current) is not clickable
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {getCrumbLabel(node)}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumbs; 