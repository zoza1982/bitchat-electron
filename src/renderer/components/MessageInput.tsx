import React, { useState, useRef, KeyboardEvent } from 'react';

interface MessageInputProps {
  onSendMessage: (content: string, isPrivate: boolean) => void;
  currentContactId?: string;
  isEncrypted: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  currentContactId,
  isEncrypted,
  disabled = false,
  placeholder
}) => {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled) return;

    const isPrivate = !!currentContactId;
    onSendMessage(trimmedMessage, isPrivate);
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }

    // Handle typing indicator
    if (!isTyping) {
      setIsTyping(true);
      // Emit typing event here if needed
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      // Emit stop typing event here if needed
    }, 1000);
  };

  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    if (!currentContactId) return 'Type a message to broadcast...';
    return isEncrypted ? 'Type an encrypted message...' : 'Type a message...';
  };

  const handleCommandHelp = () => {
    const helpText = `Available commands:
/nick <nickname> - Set your nickname
/msg <user> <message> - Send a private message
/who - List connected peers
/fav <user> - Add user to favorites
/unfav <user> - Remove user from favorites
/block <user> - Block a user
/unblock <user> - Unblock a user
/clear - Clear chat history`;
    
    alert(helpText);
  };

  return (
    <div className="message-input-container">
      <div className="message-input-wrapper">
        <div className="message-input-info">
          {isEncrypted && (
            <div className="encryption-status" title="Messages are end-to-end encrypted">
              <span className="lock-icon">🔒</span>
              <span className="encryption-text">Encrypted</span>
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="message-input"
          value={message}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          placeholder={getPlaceholder()}
          disabled={disabled}
          rows={1}
        />

        <div className="message-input-actions">
          <button
            className="help-button"
            onClick={handleCommandHelp}
            title="Show available commands"
          >
            ?
          </button>
          
          <button
            className="send-button"
            onClick={handleSend}
            disabled={disabled || !message.trim()}
          >
            <span className="send-icon">➤</span>
          </button>
        </div>
      </div>

      {message.length > 450 && (
        <div className="message-length-warning">
          {message.length}/512 - Message will be fragmented
        </div>
      )}
    </div>
  );
};

export default MessageInput;