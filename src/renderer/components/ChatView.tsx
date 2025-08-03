import React, { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  isPrivate: boolean;
}

interface Peer {
  id: string;
  nickname: string;
  isConnected: boolean;
}

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load initial peers
    loadPeers();
    
    // Set up message listener
    window.bitchatAPI.onMessageReceived((message) => {
      setMessages(prev => [...prev, {
        ...message,
        timestamp: new Date(message.timestamp)
      }]);
    });
    
    // Set up peer listeners
    window.bitchatAPI.onPeerConnected((peer) => {
      setPeers(prev => [...prev, peer]);
    });
    
    window.bitchatAPI.onPeerDisconnected((peerId) => {
      setPeers(prev => prev.filter(p => p.id !== peerId));
    });
    
    // Cleanup
    return () => {
      window.bitchatAPI.removeAllListeners('message:received');
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadPeers = async () => {
    try {
      const peerList = await window.bitchatAPI.getPeers();
      setPeers(peerList);
    } catch (error) {
      console.error('Failed to load peers:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    try {
      await window.bitchatAPI.sendMessage(inputText);
      setInputText('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <h3>Connected Peers ({peers.length})</h3>
        <ul className="peer-list">
          {peers.map(peer => (
            <li key={peer.id} className="peer-item">
              <span className="peer-nickname">{peer.nickname || peer.id.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="chat-main">
        <div className="messages-container">
          {messages.map(message => (
            <div key={message.id} className={`message ${message.isPrivate ? 'private' : ''}`}>
              <span className="message-sender">{message.sender}:</span>
              <span className="message-content">{message.content}</span>
              <span className="message-time">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="input-container">
          <textarea
            className="message-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message... (Commands: /nick, /msg, /who, /fav)"
            rows={2}
          />
          <button className="send-button" onClick={sendMessage}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatView;