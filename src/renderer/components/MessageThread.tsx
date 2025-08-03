import React, { useEffect, useRef } from 'react';

export interface Message {
  id: string;
  senderId: string;
  senderNickname?: string;
  recipientId?: string;
  content: string;
  timestamp: Date;
  isPrivate: boolean;
  isEncrypted: boolean;
  isSent: boolean;
  isDelivered?: boolean;
  isRead?: boolean;
  fragmentInfo?: {
    isFragmented: boolean;
    currentFragment: number;
    totalFragments: number;
  };
}

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  currentContactId?: string;
  onMessageAction?: (messageId: string, action: 'resend' | 'delete') => void;
}

const MessageThread: React.FC<MessageThreadProps> = ({
  messages,
  currentUserId,
  currentContactId,
  onMessageAction
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (date: Date): string => {
    const now = new Date();
    const messageDate = new Date(date);
    
    // If today, show time only
    if (messageDate.toDateString() === now.toDateString()) {
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // If this year, show month and day
    if (messageDate.getFullYear() === now.getFullYear()) {
      return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    
    // Otherwise show full date
    return messageDate.toLocaleDateString();
  };

  const renderMessage = (message: Message, prevMessage?: Message) => {
    const isOwnMessage = message.senderId === currentUserId;
    const showTimestamp = !prevMessage || 
      (new Date(message.timestamp).getTime() - new Date(prevMessage.timestamp).getTime()) > 300000; // 5 minutes

    const showSender = !prevMessage || 
      prevMessage.senderId !== message.senderId ||
      showTimestamp;

    return (
      <div
        key={message.id}
        className={`message-wrapper ${isOwnMessage ? 'own' : 'other'}`}
      >
        {showTimestamp && (
          <div className="message-timestamp-divider">
            {formatTime(message.timestamp)}
          </div>
        )}
        
        <div className={`message-bubble ${message.isPrivate ? 'private' : ''}`}>
          {!isOwnMessage && showSender && (
            <div className="message-sender">
              {message.senderNickname || message.senderId.slice(0, 8)}
            </div>
          )}
          
          <div className="message-content">
            {message.content}
            {message.fragmentInfo && (
              <span className="fragment-indicator">
                [{message.fragmentInfo.currentFragment}/{message.fragmentInfo.totalFragments}]
              </span>
            )}
          </div>
          
          <div className="message-meta">
            <span className="message-time">
              {formatTime(message.timestamp)}
            </span>
            {message.isEncrypted && (
              <span className="encryption-indicator" title="End-to-end encrypted">🔒</span>
            )}
            {isOwnMessage && (
              <span className="message-status">
                {message.isRead ? '✓✓' : message.isDelivered ? '✓✓' : message.isSent ? '✓' : '⏱'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const filteredMessages = currentContactId
    ? messages.filter(m => 
        (m.senderId === currentContactId || m.recipientId === currentContactId) ||
        (!m.isPrivate && m.senderId === currentUserId)
      )
    : messages.filter(m => !m.isPrivate);

  return (
    <div className="message-thread">
      {filteredMessages.length === 0 ? (
        <div className="no-messages">
          <div className="no-messages-icon">💬</div>
          <div className="no-messages-text">
            {currentContactId ? 'No messages yet. Say hello!' : 'Select a contact to start chatting'}
          </div>
        </div>
      ) : (
        <>
          {filteredMessages.map((message, index) => 
            renderMessage(message, index > 0 ? filteredMessages[index - 1] : undefined)
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageThread;