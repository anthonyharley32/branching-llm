import React, { useState, useEffect } from 'react';
import { fetchData, updateData } from '../../lib/db';
import { Bug } from '../../types/database';
import { useAuth } from '../../context/AuthContext';

interface BugManagementProps {
  onClose?: () => void;
}

const BugManagement: React.FC<BugManagementProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{
    status: string;
    severity: string;
    assignee: string;
  }>({
    status: '',
    severity: '',
    assignee: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [editingBug, setEditingBug] = useState<Bug | null>(null);

  // Fetch bugs when component mounts
  useEffect(() => {
    fetchBugs();
  }, []);

  const fetchBugs = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const fetchedBugs = await fetchData<'bugs'>('bugs');
      setBugs(fetchedBugs);
    } catch (err: any) {
      console.error('Error fetching bugs:', err);
      setError(err.message || 'Failed to fetch bug reports');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (bugId: string, newStatus: 'new' | 'in-progress' | 'fixed' | 'verified') => {
    try {
      // Update the bug status in the database
      await updateData('bugs', bugId, { 
        status: newStatus,
        ...(newStatus === 'fixed' ? { resolved_at: new Date().toISOString() } : {})
      });
      
      // Update the local state
      setBugs(prevBugs => 
        prevBugs.map(bug => 
          bug.id === bugId 
            ? { 
                ...bug, 
                status: newStatus,
                ...(newStatus === 'fixed' ? { resolved_at: new Date().toISOString() } : {})
              } 
            : bug
        )
      );
    } catch (err: any) {
      console.error('Error updating bug status:', err);
      setError(err.message || 'Failed to update bug status');
    }
  };

  const handleAssign = async (bugId: string) => {
    if (!user) return;
    
    try {
      // Update the bug assignee in the database
      await updateData('bugs', bugId, { assignee_id: user.id });
      
      // Update the local state
      setBugs(prevBugs => 
        prevBugs.map(bug => 
          bug.id === bugId 
            ? { ...bug, assignee_id: user.id } 
            : bug
        )
      );
    } catch (err: any) {
      console.error('Error assigning bug:', err);
      setError(err.message || 'Failed to assign bug');
    }
  };

  const handleUnassign = async (bugId: string) => {
    try {
      // Update the bug assignee in the database
      await updateData('bugs', bugId, { assignee_id: null });
      
      // Update the local state
      setBugs(prevBugs => 
        prevBugs.map(bug => 
          bug.id === bugId 
            ? { ...bug, assignee_id: null } 
            : bug
        )
      );
    } catch (err: any) {
      console.error('Error unassigning bug:', err);
      setError(err.message || 'Failed to unassign bug');
    }
  };

  const handleUpdateBug = async () => {
    if (!editingBug) return;
    
    try {
      // Update the bug in the database
      await updateData('bugs', editingBug.id, editingBug);
      
      // Update the local state
      setBugs(prevBugs => 
        prevBugs.map(bug => 
          bug.id === editingBug.id 
            ? editingBug
            : bug
        )
      );
      
      // Close the editing modal
      setEditingBug(null);
    } catch (err: any) {
      console.error('Error updating bug:', err);
      setError(err.message || 'Failed to update bug');
    }
  };

  // Filter and search bugs
  const filteredBugs = bugs
    .filter(bug => filter.status ? bug.status === filter.status : true)
    .filter(bug => filter.severity ? bug.severity === filter.severity : true)
    .filter(bug => filter.assignee === 'me' ? bug.assignee_id === user?.id : 
                   filter.assignee === 'unassigned' ? !bug.assignee_id : 
                   true)
    .filter(bug => 
      searchTerm 
        ? bug.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
          bug.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (bug.related_component && bug.related_component.toLowerCase().includes(searchTerm.toLowerCase()))
        : true
    )
    .sort((a, b) => {
      // Sort by severity first (critical > major > minor)
      const severityOrder = { critical: 0, major: 1, minor: 2 };
      const severityDiff = severityOrder[a.severity as keyof typeof severityOrder] - 
                          severityOrder[b.severity as keyof typeof severityOrder];
      
      if (severityDiff !== 0) return severityDiff;
      
      // Then sort by status (new > in-progress > fixed > verified)
      const statusOrder = { new: 0, 'in-progress': 1, fixed: 2, verified: 3 };
      const statusDiff = statusOrder[a.status as keyof typeof statusOrder] - 
                        statusOrder[b.status as keyof typeof statusOrder];
      
      if (statusDiff !== 0) return statusDiff;
      
      // Finally sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // Get severity badge color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border border-red-200';
      case 'major': return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'minor': return 'bg-blue-100 text-blue-800 border border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-purple-100 text-purple-800 border border-purple-200';
      case 'in-progress': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'fixed': return 'bg-green-100 text-green-800 border border-green-200';
      case 'verified': return 'bg-green-200 text-green-900 border border-green-300';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Bug Management</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="w-full md:w-auto">
          <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="statusFilter"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="in-progress">In Progress</option>
            <option value="fixed">Fixed</option>
            <option value="verified">Verified</option>
          </select>
        </div>

        <div className="w-full md:w-auto">
          <label htmlFor="severityFilter" className="block text-sm font-medium text-gray-700 mb-1">
            Severity
          </label>
          <select
            id="severityFilter"
            value={filter.severity}
            onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
            className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All Severities</option>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div className="w-full md:w-auto">
          <label htmlFor="assigneeFilter" className="block text-sm font-medium text-gray-700 mb-1">
            Assignee
          </label>
          <select
            id="assigneeFilter"
            value={filter.assignee}
            onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}
            className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        <div className="w-full md:w-auto flex-grow">
          <label htmlFor="searchTerm" className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            type="text"
            id="searchTerm"
            placeholder="Search by title, description, or component"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Bug List */}
      {isLoading ? (
        <div className="text-center py-10">
          <p className="text-gray-500">Loading bugs...</p>
        </div>
      ) : filteredBugs.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-500">No bugs found matching your criteria</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bug</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Component</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBugs.map((bug) => (
                <tr key={bug.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{bug.title}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {bug.description.substring(0, 80)}{bug.description.length > 80 ? '...' : ''}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(bug.status)}`}>
                      {bug.status.replace('-', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getSeverityColor(bug.severity)}`}>
                      {bug.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bug.related_component || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {/* View Details Button */}
                      <button
                        onClick={() => setEditingBug(bug)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Details
                      </button>
                      
                      {/* Status Change */}
                      {bug.status === 'new' && (
                        <button
                          onClick={() => handleStatusChange(bug.id, 'in-progress')}
                          className="text-yellow-600 hover:text-yellow-900"
                        >
                          Start
                        </button>
                      )}
                      
                      {bug.status === 'in-progress' && (
                        <button
                          onClick={() => handleStatusChange(bug.id, 'fixed')}
                          className="text-green-600 hover:text-green-900"
                        >
                          Resolve
                        </button>
                      )}
                      
                      {bug.status === 'fixed' && (
                        <button
                          onClick={() => handleStatusChange(bug.id, 'verified')}
                          className="text-purple-600 hover:text-purple-900"
                        >
                          Verify
                        </button>
                      )}
                      
                      {/* Assignment */}
                      {bug.assignee_id === user?.id ? (
                        <button
                          onClick={() => handleUnassign(bug.id)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Unassign
                        </button>
                      ) : !bug.assignee_id && (
                        <button
                          onClick={() => handleAssign(bug.id)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Assign to me
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bug Details Modal */}
      {editingBug && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Bug Details</h3>
                <button
                  onClick={() => setEditingBug(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={editingBug.title}
                    onChange={(e) => setEditingBug({...editingBug, title: e.target.value})}
                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Related Component
                  </label>
                  <input
                    type="text"
                    value={editingBug.related_component || ''}
                    onChange={(e) => setEditingBug({...editingBug, related_component: e.target.value})}
                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editingBug.status}
                    onChange={(e) => setEditingBug({
                      ...editingBug, 
                      status: e.target.value as 'new' | 'in-progress' | 'fixed' | 'verified',
                      resolved_at: e.target.value === 'fixed' || e.target.value === 'verified' 
                        ? editingBug.resolved_at || new Date().toISOString() 
                        : null
                    })}
                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="new">New</option>
                    <option value="in-progress">In Progress</option>
                    <option value="fixed">Fixed</option>
                    <option value="verified">Verified</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Severity
                  </label>
                  <select
                    value={editingBug.severity}
                    onChange={(e) => setEditingBug({...editingBug, severity: e.target.value as 'critical' | 'major' | 'minor'})}
                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="critical">Critical</option>
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editingBug.description}
                  onChange={(e) => setEditingBug({...editingBug, description: e.target.value})}
                  rows={4}
                  className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Steps to Reproduce
                  </label>
                  <textarea
                    value={editingBug.steps_to_reproduce || ''}
                    onChange={(e) => setEditingBug({...editingBug, steps_to_reproduce: e.target.value})}
                    rows={3}
                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expected Behavior
                  </label>
                  <textarea
                    value={editingBug.expected_behavior || ''}
                    onChange={(e) => setEditingBug({...editingBug, expected_behavior: e.target.value})}
                    rows={3}
                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Actual Behavior
                </label>
                <textarea
                  value={editingBug.actual_behavior || ''}
                  onChange={(e) => setEditingBug({...editingBug, actual_behavior: e.target.value})}
                  rows={3}
                  className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Environment Info */}
              {editingBug.environment && Object.keys(editingBug.environment).length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Environment Information</h4>
                  <div className="bg-gray-50 p-3 rounded text-xs">
                    <pre className="whitespace-pre-wrap text-gray-700">
                      {JSON.stringify(editingBug.environment, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Screenshots */}
              {editingBug.screenshots && editingBug.screenshots.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Screenshots</h4>
                  <div className="flex flex-wrap gap-2">
                    {editingBug.screenshots.map((url, index) => (
                      <div key={index} className="relative">
                        <img 
                          src={url} 
                          alt={`Screenshot ${index + 1}`} 
                          className="h-32 w-auto object-cover border border-gray-300 rounded"
                          onClick={() => window.open(url, '_blank')}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 mb-6 text-xs text-gray-500">
                <div>
                  <p><strong>Reported:</strong> {new Date(editingBug.created_at).toLocaleString()}</p>
                  {editingBug.resolved_at && (
                    <p><strong>Resolved:</strong> {new Date(editingBug.resolved_at).toLocaleString()}</p>
                  )}
                </div>
                <div>
                  <p><strong>Reporter ID:</strong> {editingBug.reporter_id || 'Anonymous'}</p>
                  <p><strong>Assignee ID:</strong> {editingBug.assignee_id || 'Unassigned'}</p>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setEditingBug(null)}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateBug}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BugManagement; 