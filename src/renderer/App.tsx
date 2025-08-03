import React, { useState, useEffect } from 'react';
import ChatView from './components/ChatView';

const App: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Get app version
    window.bitchatAPI.getVersion().then(setVersion);
    
    // Set up connection listeners
    window.bitchatAPI.onPeerConnected(() => {
      setIsConnected(true);
    });
    
    window.bitchatAPI.onPeerDisconnected(() => {
      setIsConnected(false);
    });
    
    // Cleanup
    return () => {
      window.bitchatAPI.removeAllListeners('peer:connected');
      window.bitchatAPI.removeAllListeners('peer:disconnected');
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>BitChat</h1>
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </header>
      <main className="app-main">
        <ChatView />
      </main>
      <footer className="app-footer">
        <span>BitChat v{version}</span>
      </footer>
    </div>
  );
};

export default App;