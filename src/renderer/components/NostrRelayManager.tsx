import React, { useState, useEffect } from 'react';
import { NostrRelayInfo } from '../../shared/ipc-types';

interface NostrRelayManagerProps {
  relays: NostrRelayInfo[];
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onConnectRelay: (url: string) => void;
  onDisconnectRelay: (url: string) => void;
}

const NostrRelayManager: React.FC<NostrRelayManagerProps> = ({
  relays,
  onAddRelay,
  onRemoveRelay,
  onConnectRelay,
  onDisconnectRelay
}) => {
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const isValidRelayUrl = (url: string): boolean => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:';
    } catch {
      return false;
    }
  };

  const handleAddRelay = () => {
    if (isValidRelayUrl(newRelayUrl)) {
      onAddRelay(newRelayUrl);
      setNewRelayUrl('');
      setShowAddForm(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  const defaultRelays = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://offchain.pub',
    'wss://nostr21.com',
    'wss://nos.lol',
    'wss://relay.nostr.band'
  ];

  return (
    <div className="nostr-relay-manager">
      <div className="relay-manager-header">
        <h3>Nostr Relays</h3>
        <button 
          className="add-relay-btn"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? '✕' : '+'}
        </button>
      </div>

      {showAddForm && (
        <div className="add-relay-form">
          <div className="form-row">
            <input
              type="text"
              className="relay-url-input"
              placeholder="wss://relay.example.com"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddRelay()}
            />
            <button 
              className="btn-primary"
              onClick={handleAddRelay}
              disabled={!isValidRelayUrl(newRelayUrl)}
            >
              Add
            </button>
          </div>
          <div className="suggested-relays">
            <span className="suggestions-label">Suggested:</span>
            {defaultRelays
              .filter(url => !relays.find(r => r.url === url))
              .slice(0, 3)
              .map(url => (
                <button
                  key={url}
                  className="suggested-relay"
                  onClick={() => setNewRelayUrl(url)}
                >
                  {new URL(url).hostname}
                </button>
              ))
            }
          </div>
        </div>
      )}

      <div className="relay-list">
        {relays.length === 0 ? (
          <div className="no-relays">
            <p>No relays configured</p>
            <p className="help-text">Add a relay to connect to the Nostr network</p>
          </div>
        ) : (
          relays.map((relay) => (
            <div key={relay.url} className="relay-item">
              <div className="relay-info">
                <div className="relay-header">
                  <span className="relay-status-icon">
                    {getStatusIcon(relay.status)}
                  </span>
                  <span className="relay-url" title={relay.url}>
                    {new URL(relay.url).hostname}
                  </span>
                  <span className="relay-status-text">
                    {getStatusText(relay.status)}
                  </span>
                </div>
                <div className="relay-details">
                  {relay.error && (
                    <div className="relay-error">
                      Error: {relay.error}
                    </div>
                  )}
                  {relay.activeSubscriptions > 0 && (
                    <div className="relay-subscriptions">
                      {relay.activeSubscriptions} active subscription{relay.activeSubscriptions !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
              <div className="relay-actions">
                {relay.status === 'connected' ? (
                  <button
                    className="btn-secondary"
                    onClick={() => onDisconnectRelay(relay.url)}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => onConnectRelay(relay.url)}
                    disabled={relay.status === 'connecting'}
                  >
                    {relay.status === 'connecting' ? 'Connecting...' : 'Connect'}
                  </button>
                )}
                <button
                  className="btn-danger"
                  onClick={() => onRemoveRelay(relay.url)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="relay-summary">
        <div className="summary-item">
          <span className="summary-label">Total:</span>
          <span className="summary-value">{relays.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Connected:</span>
          <span className="summary-value">
            {relays.filter(r => r.status === 'connected').length}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Subscriptions:</span>
          <span className="summary-value">
            {relays.reduce((sum, r) => sum + r.activeSubscriptions, 0)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NostrRelayManager;