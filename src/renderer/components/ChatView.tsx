import React, { useState, useEffect } from 'react';
import ContactList, { Contact } from './ContactList';
import MessageThread, { Message } from './MessageThread';
import MessageInput from './MessageInput';
import ConnectionStatus from './ConnectionStatus';

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>();
  const [currentUserId] = useState('self'); // TODO: Get from session manager
  
  useEffect(() => {
    // Load initial contacts
    loadContacts();
    
    // Set up message listener
    window.bitchatAPI.onMessageReceived((message) => {
      setMessages(prev => [...prev, {
        id: message.id || Date.now().toString(),
        senderId: message.senderId,
        senderNickname: message.senderNickname,
        recipientId: message.recipientId,
        content: message.content,
        timestamp: new Date(message.timestamp),
        isPrivate: message.isPrivate || false,
        isEncrypted: message.isEncrypted || false,
        isSent: false,
        isDelivered: message.isDelivered,
        isRead: message.isRead
      }]);
    });
    
    // Set up peer listeners
    window.bitchatAPI.onPeerConnected((peer) => {
      setContacts(prev => {
        const existing = prev.find(c => c.id === peer.id);
        if (existing) {
          return prev.map(c => c.id === peer.id ? { ...c, isConnected: true } : c);
        }
        return [...prev, {
          id: peer.id,
          nickname: peer.nickname,
          fingerprint: peer.fingerprint,
          isConnected: true,
          isFavorite: false
        }];
      });
    });
    
    window.bitchatAPI.onPeerDisconnected((peerId) => {
      setContacts(prev => prev.map(c => 
        c.id === peerId ? { ...c, isConnected: false, lastSeen: new Date() } : c
      ));
    });
    
    // Cleanup
    return () => {
      window.bitchatAPI.removeAllListeners('message:received');
      window.bitchatAPI.removeAllListeners('peer:connected');
      window.bitchatAPI.removeAllListeners('peer:disconnected');
    };
  }, []);

  const loadContacts = async () => {
    try {
      const peerList = await window.bitchatAPI.getPeers();
      setContacts(peerList.map((peer: any) => ({
        id: peer.id,
        nickname: peer.nickname,
        fingerprint: peer.fingerprint,
        isConnected: peer.isConnected || false,
        isFavorite: peer.isFavorite || false,
        lastSeen: peer.lastSeen ? new Date(peer.lastSeen) : undefined,
        unreadCount: 0
      })));
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const handleSendMessage = async (content: string, isPrivate: boolean) => {
    try {
      const recipient = isPrivate ? selectedContactId : undefined;
      await window.bitchatAPI.sendMessage(content, recipient);
      
      // Add message to local state
      const newMessage: Message = {
        id: Date.now().toString(),
        senderId: currentUserId,
        recipientId: recipient,
        content,
        timestamp: new Date(),
        isPrivate,
        isEncrypted: isPrivate && !!selectedContactId,
        isSent: true,
        isDelivered: false,
        isRead: false
      };
      
      setMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleContactSelect = (contactId: string) => {
    setSelectedContactId(contactId === selectedContactId ? undefined : contactId);
  };

  const handleContactAction = async (contactId: string, action: string) => {
    // TODO: Implement contact actions (favorite, unfavorite, block)
    console.log(`Contact action: ${action} on ${contactId}`);
  };

  const selectedContact = contacts.find(c => c.id === selectedContactId);
  const isEncrypted = !!selectedContact && selectedContact.isConnected;

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <ConnectionStatus />
        <ContactList
          contacts={contacts}
          selectedContactId={selectedContactId}
          onContactSelect={handleContactSelect}
          onContactAction={handleContactAction}
        />
      </div>
      
      <div className="chat-main">
        <div className="chat-header">
          {selectedContact ? (
            <>
              <div className="chat-header-info">
                <h3>{selectedContact.nickname || selectedContact.id.slice(0, 8)}</h3>
                <span className="chat-header-status">
                  {selectedContact.isConnected ? 'Online' : 'Offline'}
                  {isEncrypted && ' • Encrypted'}
                </span>
              </div>
              {selectedContact.fingerprint && (
                <div className="chat-header-fingerprint" title={selectedContact.fingerprint}>
                  {selectedContact.fingerprint.slice(0, 16)}...
                </div>
              )}
            </>
          ) : (
            <h3>Broadcast Channel</h3>
          )}
        </div>
        
        <MessageThread
          messages={messages}
          currentUserId={currentUserId}
          currentContactId={selectedContactId}
        />
        
        <MessageInput
          onSendMessage={handleSendMessage}
          currentContactId={selectedContactId}
          isEncrypted={isEncrypted}
          disabled={selectedContact ? !selectedContact.isConnected : false}
        />
      </div>
    </div>
  );
};

export default ChatView;