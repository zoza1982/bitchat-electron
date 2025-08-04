import React, { useState, useEffect } from 'react';
import { ConnectionStatus as ConnectionStatusType } from '../../shared/ipc-types';

const ConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatusType | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Load initial status
    loadStatus();

    // Set up status change listener
    window.bitchatAPI.onConnectionStatusChanged((newStatus) => {
      setStatus(newStatus);
    });

    // Refresh status periodically
    const interval = setInterval(loadStatus, 5000);

    return () => {
      clearInterval(interval);
      window.bitchatAPI.removeAllListeners('connection:status');
    };
  }, []);

  const loadStatus = async () => {
    try {
      const connectionStatus = await window.bitchatAPI.getConnectionStatus();
      setStatus(connectionStatus);
    } catch (error) {
      console.error('Failed to load connection status:', error);
    }
  };

  if (!status) {
    return null;
  }

  const getTransportIcon = () => {
    if (status.transport === 'hybrid') return '📶🌐';
    if (status.ble.isConnected) return '📶';
    if (status.nostr.isConnected) return '🌐';
    if (status.ble.isAdvertising || status.nostr.isEnabled) return '🔄';
    return '🔌';
  };

  const getTransportText = () => {
    if (status.transport === 'hybrid') {
      return `Hybrid • ${status.connectedPeers} peer${status.connectedPeers !== 1 ? 's' : ''}`;
    }
    if (status.ble.isConnected) {
      return `BLE • ${status.connectedPeers} peer${status.connectedPeers !== 1 ? 's' : ''}`;
    }
    if (status.nostr.isConnected) {
      return `Nostr • ${status.connectedPeers} peer${status.connectedPeers !== 1 ? 's' : ''}`;
    }
    if (status.ble.isAdvertising) {
      return 'BLE • Advertising...';
    }
    if (status.nostr.isEnabled && status.nostr.connectedRelays > 0) {
      return `Nostr • ${status.nostr.connectedRelays}/${status.nostr.totalRelays} relays`;
    }
    if (status.nostr.isEnabled) {
      return 'Nostr • Connecting...';
    }
    return 'Offline';
  };

  const getConnectionClass = () => {
    if (status.isConnected) return 'connected';
    if (status.ble.isAdvertising || status.nostr.isEnabled) return 'connecting';
    return 'disconnected';
  };

  return (
    <div className="connection-status-container">
      <button
        className={`connection-status-bar ${getConnectionClass()}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="transport-icon">{getTransportIcon()}</span>
        <span className="transport-text">{getTransportText()}</span>
        <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
      </button>

      {isExpanded && (
        <div className="connection-details">
          <div className="transport-section">
            <h4>Bluetooth Low Energy</h4>
            <div className="status-row">
              <span className="status-label">Status:</span>
              <span className={`status-value ${status.ble.isEnabled ? 'enabled' : 'disabled'}`}>
                {status.ble.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Advertising:</span>
              <span className={`status-value ${status.ble.isAdvertising ? 'active' : 'inactive'}`}>
                {status.ble.isAdvertising ? 'Active' : 'Inactive'}
              </span>
            </div>
            {status.ble.connectedDevice && (
              <>
                <div className="status-row">
                  <span className="status-label">Connected To:</span>
                  <span className="status-value">{status.ble.connectedDevice.address}</span>
                </div>
                {status.ble.connectedDevice.rssi !== undefined && (
                  <div className="status-row">
                    <span className="status-label">Signal:</span>
                    <span className="status-value">{status.ble.connectedDevice.rssi} dBm</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="transport-section">
            <h4>Nostr Network</h4>
            <div className="status-row">
              <span className="status-label">Status:</span>
              <span className={`status-value ${status.nostr.isEnabled ? 'enabled' : 'disabled'}`}>
                {status.nostr.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {status.nostr.isEnabled && (
              <>
                <div className="status-row">
                  <span className="status-label">Relays:</span>
                  <span className="status-value">
                    {status.nostr.connectedRelays}/{status.nostr.totalRelays}
                  </span>
                </div>
                {status.nostr.publicKey && (
                  <div className="status-row">
                    <span className="status-label">Public Key:</span>
                    <span className="status-value" title={status.nostr.publicKey}>
                      {status.nostr.publicKey.substring(0, 16)}...
                    </span>
                  </div>
                )}
                {status.nostr.peers > 0 && (
                  <div className="status-row">
                    <span className="status-label">Nostr Peers:</span>
                    <span className="status-value">{status.nostr.peers}</span>
                  </div>
                )}
                {status.nostr.relays.length > 0 && (
                  <div className="relay-list">
                    <span className="status-label">Relay Status:</span>
                    <div className="relay-details">
                      {status.nostr.relays.map((relay, index) => (
                        <div key={index} className="relay-item">
                          <span className={`relay-status ${relay.status}`}>
                            {relay.status === 'connected' ? '🟢' : 
                             relay.status === 'connecting' ? '🟡' : 
                             relay.status === 'error' ? '🔴' : '⚪'}
                          </span>
                          <span className="relay-url" title={relay.url}>
                            {new URL(relay.url).hostname}
                          </span>
                          {relay.activeSubscriptions > 0 && (
                            <span className="relay-subs">({relay.activeSubscriptions})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="uptime-section">
            <div className="status-row">
              <span className="status-label">Uptime:</span>
              <span className="status-value">{formatUptime(status.uptime)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export default ConnectionStatus;