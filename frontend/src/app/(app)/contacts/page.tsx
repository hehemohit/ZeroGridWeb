'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, Plus, Trash2, Search, Phone, Mail, X } from 'lucide-react';
import { Card, Button, Input, Spinner } from '@/components/ui';

interface ContactUser {
  id: string;
  displayName: string;
  email: string;
  phoneNumber: string | null;
  role: string;
  photoUrl: string | null;
}

interface Contact {
  id: string;
  label: string;
  createdAt: string;
  contactUser: ContactUser;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function fetchContacts() {
    setLoading(true);
    try {
      const data = await api.get<{ contacts: Contact[] }>('/api/contacts');
      setContacts(data.contacts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchContacts(); }, []);

  async function handleAdd() {
    if (!addInput.trim()) return;
    setAddError(''); setAddLoading(true);
    try {
      await api.post('/api/contacts', {
        contactEmailOrPhone: addInput.trim(),
        label: addLabel.trim() || undefined,
      });
      setShowAdd(false);
      setAddInput(''); setAddLabel('');
      await fetchContacts();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteId(id);
    try {
      await api.del(`/api/contacts/${id}`);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch {
      // show error in a real app
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8 fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-white">Emergency Contacts</h1>
          <p className="text-gray-500 text-sm">These people get notified when you trigger an SOS.</p>
        </div>
        <Button id="contacts-add-btn" onClick={() => setShowAdd(true)} variant="primary" size="sm" className="shrink-0">
          <Plus className="w-4 h-4" /> Add Contact
        </Button>
      </div>

      {/* Add contact modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-5 fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Add Emergency Contact</h2>
              <button onClick={() => { setShowAdd(false); setAddError(''); }} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{addError}</div>
            )}

            <Input
              id="contact-email-phone"
              label="Email or Phone Number"
              placeholder="alice@example.com or +919999999999"
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
            />
            <Input
              id="contact-label"
              label="Label (optional)"
              placeholder='e.g. "Mom", "Best Friend"'
              value={addLabel}
              onChange={e => setAddLabel(e.target.value)}
            />

            <div className="flex gap-3 pt-1">
              <Button id="contact-add-submit" onClick={handleAdd} loading={addLoading} className="flex-1">Add Contact</Button>
              <Button variant="secondary" onClick={() => { setShowAdd(false); setAddError(''); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Contact list */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8 text-red-500" /></div>
      ) : contacts.length === 0 ? (
        <Card className="text-center py-16 space-y-4">
          <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto">
            <Users className="w-7 h-7 text-gray-600" />
          </div>
          <p className="text-gray-400 font-medium">No emergency contacts yet</p>
          <p className="text-gray-600 text-sm">Add trusted ZeroGrid users who will be notified in case of an emergency.</p>
          <Button id="contacts-empty-add" onClick={() => setShowAdd(true)} variant="primary" size="sm" className="mx-auto">
            <Plus className="w-4 h-4" /> Add Your First Contact
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {contacts.map(c => (
            <Card key={c.id} className="flex items-center gap-4 group hover:border-white/12 transition-all">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-500 rounded-xl flex items-center justify-center text-white font-bold shrink-0">
                {c.contactUser.displayName?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-white truncate">{c.contactUser.displayName}</p>
                  {c.label && (
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full shrink-0">{c.label}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.contactUser.email}</span>
                  {c.contactUser.phoneNumber && (
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.contactUser.phoneNumber}</span>
                  )}
                </div>
              </div>
              <button
                id={`contact-delete-${c.id}`}
                onClick={() => handleDelete(c.id)}
                disabled={deleteId === c.id}
                className="text-gray-600 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10"
              >
                {deleteId === c.id ? <Spinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
