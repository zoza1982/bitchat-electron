import React, { useState, useEffect } from 'react';

export interface TransportPreferences {
  preferredTransport: 'ble' | 'nostr' | 'auto';
  autoConnect: boolean;
  bleSettings: {
    deviceName: string;
    autoAdvertise: boolean;
    discoverabilityTimeout: number; // minutes
  };
  nostrSettings: {
    autoConnectRelays: boolean;
    maxRelayConnections: number;
    defaultRelays: string[];
    reconnectAttempts: number;
  };
  hybridSettings: {
    priority: 'ble' | 'nostr' | 'balanced';
    fallbackBehavior: 'switch' | 'maintain-both';
    connectionTimeout: number; // seconds
  };
}

interface TransportPreferencesProps {
  preferences: TransportPreferences;
  onPreferencesChange: (preferences: TransportPreferences) => void;
  onSave: () => void;
  onReset: () => void;
}

const TransportPreferences: React.FC<TransportPreferencesProps> = ({
  preferences,
  onPreferencesChange,
  onSave,
  onReset
}) => {
  const [localPreferences, setLocalPreferences] = useState<TransportPreferences>(preferences);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalPreferences(preferences);
    setHasChanges(false);
  }, [preferences]);

  const updatePreferences = (updates: Partial<TransportPreferences>) => {
    const newPreferences = { ...localPreferences, ...updates };
    setLocalPreferences(newPreferences);
    setHasChanges(true);
    onPreferencesChange(newPreferences);
  };

  const updateBleSettings = (updates: Partial<TransportPreferences['bleSettings']>) => {
    updatePreferences({
      bleSettings: { ...localPreferences.bleSettings, ...updates }
    });
  };

  const updateNostrSettings = (updates: Partial<TransportPreferences['nostrSettings']>) => {
    updatePreferences({
      nostrSettings: { ...localPreferences.nostrSettings, ...updates }
    });
  };

  const updateHybridSettings = (updates: Partial<TransportPreferences['hybridSettings']>) => {
    updatePreferences({
      hybridSettings: { ...localPreferences.hybridSettings, ...updates }
    });
  };

  const handleSave = () => {
    onSave();
    setHasChanges(false);
  };

  const handleReset = () => {
    onReset();
    setHasChanges(false);
  };

  const getTransportDescription = (transport: string) => {
    switch (transport) {
      case 'ble':
        return 'Use Bluetooth Low Energy for local peer-to-peer communication';
      case 'nostr':
        return 'Use Nostr network for global decentralized communication';
      case 'auto':
        return 'Automatically use the best available transport method';
      default:
        return '';
    }
  };

  return (
    <div className="transport-preferences">
      <div className="preferences-header">
        <h3>Transport Preferences</h3>
        <div className="preferences-actions">
          <button 
            className="btn-secondary" 
            onClick={handleReset}
            disabled={!hasChanges}
          >
            Reset
          </button>
          <button 
            className="btn-primary" 
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* General Transport Settings */}
      <div className="preference-section">
        <h4>General Settings</h4>
        
        <div className="preference-item">
          <label className="preference-label">Preferred Transport</label>
          <div className="transport-options">
            {['ble', 'nostr', 'auto'].map((transport) => (
              <label key={transport} className="transport-option">
                <input
                  type="radio"
                  name="preferredTransport"
                  value={transport}
                  checked={localPreferences.preferredTransport === transport}
                  onChange={(e) => updatePreferences({ preferredTransport: e.target.value as any })}
                />
                <div className="transport-option-content">
                  <span className="transport-name">
                    {transport === 'ble' ? 'Bluetooth LE' : transport === 'nostr' ? 'Nostr Network' : 'Auto Select'}
                  </span>
                  <span className="transport-description">
                    {getTransportDescription(transport)}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="preference-item">
          <label className="preference-checkbox">
            <input
              type="checkbox"
              checked={localPreferences.autoConnect}
              onChange={(e) => updatePreferences({ autoConnect: e.target.checked })}
            />
            <span>Auto-connect on startup</span>
          </label>
          <span className="preference-help">Automatically connect to available peers when the app starts</span>
        </div>
      </div>

      {/* Bluetooth LE Settings */}
      <div className="preference-section">
        <h4>Bluetooth LE Settings</h4>
        
        <div className="preference-item">
          <label className="preference-label">Device Name</label>
          <input
            type="text"
            className="preference-input"
            value={localPreferences.bleSettings.deviceName}
            onChange={(e) => updateBleSettings({ deviceName: e.target.value })}
            placeholder="BitChat Device"
            maxLength={20}
          />
          <span className="preference-help">Name visible to other BitChat users nearby</span>
        </div>

        <div className="preference-item">
          <label className="preference-checkbox">
            <input
              type="checkbox"
              checked={localPreferences.bleSettings.autoAdvertise}
              onChange={(e) => updateBleSettings({ autoAdvertise: e.target.checked })}
            />
            <span>Auto-advertise presence</span>
          </label>
          <span className="preference-help">Automatically make yourself discoverable to nearby peers</span>
        </div>

        <div className="preference-item">
          <label className="preference-label">Discoverability Timeout</label>
          <div className="preference-range">
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={localPreferences.bleSettings.discoverabilityTimeout}
              onChange={(e) => updateBleSettings({ discoverabilityTimeout: parseInt(e.target.value) })}
            />
            <span className="range-value">{localPreferences.bleSettings.discoverabilityTimeout} min</span>
          </div>
          <span className="preference-help">How long to remain discoverable after advertising starts</span>
        </div>
      </div>

      {/* Nostr Settings */}
      <div className="preference-section">
        <h4>Nostr Network Settings</h4>
        
        <div className="preference-item">
          <label className="preference-checkbox">
            <input
              type="checkbox"
              checked={localPreferences.nostrSettings.autoConnectRelays}
              onChange={(e) => updateNostrSettings({ autoConnectRelays: e.target.checked })}
            />
            <span>Auto-connect to relays</span>
          </label>
          <span className="preference-help">Automatically connect to configured relays on startup</span>
        </div>

        <div className="preference-item">
          <label className="preference-label">Max Relay Connections</label>
          <div className="preference-range">
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={localPreferences.nostrSettings.maxRelayConnections}
              onChange={(e) => updateNostrSettings({ maxRelayConnections: parseInt(e.target.value) })}
            />
            <span className="range-value">{localPreferences.nostrSettings.maxRelayConnections}</span>
          </div>
          <span className="preference-help">Maximum number of simultaneous relay connections</span>
        </div>

        <div className="preference-item">
          <label className="preference-label">Reconnect Attempts</label>
          <div className="preference-range">
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={localPreferences.nostrSettings.reconnectAttempts}
              onChange={(e) => updateNostrSettings({ reconnectAttempts: parseInt(e.target.value) })}
            />
            <span className="range-value">
              {localPreferences.nostrSettings.reconnectAttempts === 0 ? 'Disabled' : localPreferences.nostrSettings.reconnectAttempts}
            </span>
          </div>
          <span className="preference-help">Number of reconnection attempts when a relay disconnects</span>
        </div>
      </div>

      {/* Hybrid Mode Settings */}
      {localPreferences.preferredTransport === 'auto' && (
        <div className="preference-section">
          <h4>Hybrid Mode Settings</h4>
          
          <div className="preference-item">
            <label className="preference-label">Connection Priority</label>
            <select
              className="preference-select"
              value={localPreferences.hybridSettings.priority}
              onChange={(e) => updateHybridSettings({ priority: e.target.value as any })}
            >
              <option value="ble">Prefer Bluetooth LE</option>
              <option value="nostr">Prefer Nostr Network</option>
              <option value="balanced">Balanced (use both)</option>
            </select>
            <span className="preference-help">Which transport to prioritize when both are available</span>
          </div>

          <div className="preference-item">
            <label className="preference-label">Fallback Behavior</label>
            <div className="fallback-options">
              <label className="fallback-option">
                <input
                  type="radio"
                  name="fallbackBehavior"
                  value="switch"
                  checked={localPreferences.hybridSettings.fallbackBehavior === 'switch'}
                  onChange={(e) => updateHybridSettings({ fallbackBehavior: e.target.value as any })}
                />
                <span>Switch to available transport</span>
              </label>
              <label className="fallback-option">
                <input
                  type="radio"
                  name="fallbackBehavior"
                  value="maintain-both"
                  checked={localPreferences.hybridSettings.fallbackBehavior === 'maintain-both'}
                  onChange={(e) => updateHybridSettings({ fallbackBehavior: e.target.value as any })}
                />
                <span>Maintain both connections</span>
              </label>
            </div>
            <span className="preference-help">How to handle transport failures in hybrid mode</span>
          </div>

          <div className="preference-item">
            <label className="preference-label">Connection Timeout</label>
            <div className="preference-range">
              <input
                type="range"
                min="5"
                max="60"
                step="5"
                value={localPreferences.hybridSettings.connectionTimeout}
                onChange={(e) => updateHybridSettings({ connectionTimeout: parseInt(e.target.value) })}
              />
              <span className="range-value">{localPreferences.hybridSettings.connectionTimeout}s</span>
            </div>
            <span className="preference-help">How long to wait for transport connections before giving up</span>
          </div>
        </div>
      )}

      {/* Status Indicator */}
      {hasChanges && (
        <div className="preferences-status">
          <span className="changes-indicator">⚠️ You have unsaved changes</span>
        </div>
      )}
    </div>
  );
};

export default TransportPreferences;