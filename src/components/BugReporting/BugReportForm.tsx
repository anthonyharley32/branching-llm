import React, { useState, FormEvent, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { insertData } from '../../lib/db';

interface BugReportFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const BugReportForm: React.FC<BugReportFormProps> = ({ onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [environmentInfo, setEnvironmentInfo] = useState<Record<string, any>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'minor' | 'major' | 'critical'>('minor');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [relatedComponent, setRelatedComponent] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);

  // Capture environment info when component mounts
  useEffect(() => {
    const env = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      physicalScreenWidth: Math.round(window.screen.width * window.devicePixelRatio),
      physicalScreenHeight: Math.round(window.screen.height * window.devicePixelRatio),
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      referrer: document.referrer,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    setEnvironmentInfo(env);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Insert bug report into the database
      await insertData('bugs', {
        title,
        description,
        severity,
        status: 'new',
        reporter_id: user?.id || null,
        steps_to_reproduce: stepsToReproduce,
        expected_behavior: expectedBehavior,
        actual_behavior: actualBehavior,
        related_component: relatedComponent,
        environment: environmentInfo,
        screenshots: screenshots.length > 0 ? screenshots : null,
      });
      
      setSuccess(true);
      // Reset form
      setTitle('');
      setDescription('');
      setSeverity('minor');
      setStepsToReproduce('');
      setExpectedBehavior('');
      setActualBehavior('');
      setRelatedComponent('');
      setScreenshots([]);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error submitting bug report:', err);
      setError(err.message || 'Failed to submit bug report');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `bug-screenshots/${fileName}`;
    
    try {
      const { error: uploadError } = await supabase.storage
        .from('bug-reports')
        .upload(filePath, file);
        
      if (uploadError) {
        throw uploadError;
      }
      
      const { data: urlData } = supabase.storage
        .from('bug-reports')
        .getPublicUrl(filePath);
        
      if (urlData?.publicUrl) {
        setScreenshots([...screenshots, urlData.publicUrl]);
      }
    } catch (err: any) {
      console.error('Error uploading screenshot:', err);
      setError(`Error uploading screenshot: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Report a Bug</h2>
      
      {success ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>Bug report submitted successfully!</p>
          <button 
            onClick={() => setSuccess(false)}
            className="mt-2 bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-2 rounded text-sm"
          >
            Submit Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              <p>{error}</p>
            </div>
          )}
          
          <div className="mb-6 p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-blue-700">
              Help us improve by reporting issues you encounter. We'll automatically collect technical information.
            </p>
          </div>
          
          {/* Essential Fields */}
          <div className="space-y-4 mb-6">
            {/* Title */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="title">
                Issue Title <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                type="text"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                placeholder="Briefly describe the issue (e.g., 'App crashes when uploading images')"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            
            {/* Description */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline min-h-[100px]"
                placeholder="Please provide details about what happened..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            
            {/* Screenshot */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="screenshots">
                Add a Screenshot
              </label>
              <input
                id="screenshots"
                type="file"
                accept="image/*"
                onChange={handleScreenshotUpload}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                disabled={isSubmitting}
              />
              {screenshots.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {screenshots.map((url, index) => (
                    <div key={index} className="relative">
                      <img 
                        src={url} 
                        alt={`Screenshot ${index + 1}`} 
                        className="h-20 w-auto object-cover border border-gray-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => setScreenshots(screenshots.filter((_, i) => i !== index))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        disabled={isSubmitting}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Advanced Toggle */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm text-blue-600 hover:underline focus:outline-none"
            >
              <svg 
                className={`w-4 h-4 mr-1 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
            </button>
          </div>
          
          {/* Advanced Fields */}
          {showAdvanced && (
            <div className="space-y-4 mb-6 p-3 bg-gray-50 rounded border border-gray-200">
              {/* Severity */}
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="severity">
                  Severity
                </label>
                <select
                  id="severity"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as 'minor' | 'major' | 'critical')}
                  disabled={isSubmitting}
                >
                  <option value="minor">Minor - Low impact, non-critical functionality</option>
                  <option value="major">Major - Significant impact, core functionality affected</option>
                  <option value="critical">Critical - Application crash, data loss, security issue</option>
                </select>
              </div>
              
              {/* Related Component */}
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="relatedComponent">
                  Related Component
                </label>
                <input
                  id="relatedComponent"
                  type="text"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  placeholder="Which part of the application is affected? (e.g., Chat, Auth, UI)"
                  value={relatedComponent}
                  onChange={(e) => setRelatedComponent(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              
              {/* Steps to Reproduce */}
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="stepsToReproduce">
                  Steps to Reproduce
                </label>
                <textarea
                  id="stepsToReproduce"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline min-h-[80px]"
                  placeholder="1. Go to... 2. Click on... 3. Observe..."
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              
              {/* Expected/Actual Behavior */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="expectedBehavior">
                    Expected Behavior
                  </label>
                  <textarea
                    id="expectedBehavior"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline h-24"
                    placeholder="What should have happened?"
                    value={expectedBehavior}
                    onChange={(e) => setExpectedBehavior(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="actualBehavior">
                    Actual Behavior
                  </label>
                  <textarea
                    id="actualBehavior"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline h-24"
                    placeholder="What actually happened?"
                    value={actualBehavior}
                    onChange={(e) => setActualBehavior(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>
          )}
          
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
            Technical info will be collected: Browser ({getBrowserName()}), OS ({getOS()}), URL ({window.location.href}), App Version ({appVersion})
          </div>
          
          <div className="flex justify-end gap-2 mt-6">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 focus:outline-none"
                disabled={isSubmitting}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </span>
              ) : 'Submit Bug Report'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// Helper function to extract the actual browser name from user agent string
const getBrowserName = (userAgent?: string): string => {
  if (!userAgent) return 'Unknown';
  
  // Check for common browsers
  if (userAgent.indexOf('Chrome') > -1 && userAgent.indexOf('Edg') === -1 && userAgent.indexOf('OPR') === -1) {
    return 'Chrome';
  } else if (userAgent.indexOf('Firefox') > -1) {
    return 'Firefox';
  } else if (userAgent.indexOf('Safari') > -1 && userAgent.indexOf('Chrome') === -1) {
    return 'Safari';
  } else if (userAgent.indexOf('Edg') > -1) {
    return 'Edge';
  } else if (userAgent.indexOf('OPR') > -1 || userAgent.indexOf('Opera') > -1) {
    return 'Opera';
  } else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident/') > -1) {
    return 'Internet Explorer';
  }
  
  // If no match, return first part of user agent (fallback)
  return userAgent.split(' ')[0];
};

// Helper function to get OS information
const getOS = (): string => {
  const userAgent = navigator.userAgent;
  
  if (userAgent.indexOf('Win') !== -1) return 'Windows';
  if (userAgent.indexOf('Mac') !== -1) return 'macOS';
  if (userAgent.indexOf('Linux') !== -1) return 'Linux';
  if (userAgent.indexOf('Android') !== -1) return 'Android';
  if (userAgent.indexOf('iOS') !== -1 || userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) return 'iOS';
  
  return 'Unknown';
};

// Application version
const appVersion = '1.0.0'; // Replace with actual version when available

export default BugReportForm; 