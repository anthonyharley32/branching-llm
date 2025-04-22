import React, { useState } from 'react';
import Login from './Login';
import Register from './Register';

// Container to switch between Login and Register views
const AuthContainer: React.FC = () => {
  const [showLogin, setShowLogin] = useState(true);

  const switchToLogin = () => setShowLogin(true);
  const switchToRegister = () => setShowLogin(false);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      {showLogin ? (
        <Login onSwitchToRegister={switchToRegister} />
      ) : (
        <Register onSwitchToLogin={switchToLogin} />
      )}
      {/* Removed the toggle button from here as it's now inside Login/Register */}
    </div>
  );
};

export default AuthContainer; 