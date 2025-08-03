import React, { useState } from 'react';

export interface Contact {
  id: string;
  nickname?: string;
  fingerprint?: string;
  isConnected: boolean;
  isFavorite: boolean;
  lastSeen?: Date;
  unreadCount?: number;
}

interface ContactListProps {
  contacts: Contact[];
  selectedContactId?: string;
  onContactSelect: (contactId: string) => void;
  onContactAction: (contactId: string, action: 'favorite' | 'unfavorite' | 'block') => void;
}

const ContactList: React.FC<ContactListProps> = ({
  contacts,
  selectedContactId,
  onContactSelect,
  onContactAction
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showOffline, setShowOffline] = useState(true);

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = !searchTerm || 
      contact.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOnline = showOffline || contact.isConnected;
    return matchesSearch && matchesOnline;
  });

  const favoriteContacts = filteredContacts.filter(c => c.isFavorite);
  const regularContacts = filteredContacts.filter(c => !c.isFavorite);

  const renderContact = (contact: Contact) => {
    const displayName = contact.nickname || `${contact.id.slice(0, 8)}...`;
    const isSelected = contact.id === selectedContactId;

    return (
      <div
        key={contact.id}
        className={`contact-item ${isSelected ? 'selected' : ''} ${!contact.isConnected ? 'offline' : ''}`}
        onClick={() => onContactSelect(contact.id)}
        title={contact.fingerprint}
      >
        <div className="contact-avatar">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="contact-info">
          <div className="contact-name">
            {displayName}
            {contact.isFavorite && <span className="favorite-star">★</span>}
          </div>
          <div className="contact-status">
            {contact.isConnected ? 'Online' : `Last seen ${contact.lastSeen?.toLocaleDateString() || 'Never'}`}
          </div>
        </div>
        {contact.unreadCount ? (
          <div className="unread-badge">{contact.unreadCount}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="contact-list">
      <div className="contact-list-header">
        <input
          type="text"
          className="contact-search"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <label className="show-offline-toggle">
          <input
            type="checkbox"
            checked={showOffline}
            onChange={(e) => setShowOffline(e.target.checked)}
          />
          Show offline
        </label>
      </div>

      <div className="contact-list-content">
        {favoriteContacts.length > 0 && (
          <div className="contact-group">
            <div className="contact-group-header">Favorites</div>
            {favoriteContacts.map(renderContact)}
          </div>
        )}

        <div className="contact-group">
          <div className="contact-group-header">
            Contacts ({regularContacts.length})
          </div>
          {regularContacts.map(renderContact)}
        </div>

        {filteredContacts.length === 0 && (
          <div className="no-contacts">
            {searchTerm ? 'No contacts found' : 'No contacts yet'}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactList;