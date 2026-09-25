'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, Plus, Trash2, Phone, Mail, X } from 'lucide-react';
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
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 space-y-6 sm:space-y-8 fade-in text-primaryText">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-0">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-primaryText font-display">Emergency Contacts</h1>
          <p className="text-mutedGray text-xs sm:text-sm">These people get notified when you trigger an SOS.</p>
        </div>
        <Button
          id="contacts-add-btn"
          onClick={() => setShowAdd(true)}
          variant="primary"
          size="sm"
          className="shrink-0 bg-brandTeal hover:bg-brandTealGlow text-white border-none shadow-sm rounded-full w-full sm:w-auto flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Contact
        </Button>
      </div>

      {/* Add Contact Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-hairline shadow-2xl rounded-2xl p-5 sm:p-6 w-full max-w-md space-y-5 fade-in text-primaryText">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-primaryText text-lg">Add Emergency Contact</h2>
              <button
                onClick={() => { setShowAdd(false); setAddError(''); }}
                className="text-mutedGray hover:text-primaryText bg-surfaceElevated hover:bg-surfaceCard p-1.5 rounded-full transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {addError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-500 font-medium">
                {addError}
              </div>
            )}

            <div className="space-y-4">
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
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => { setShowAdd(false); setAddError(''); }}
                className="flex-1 rounded-full"
              >
                Cancel
              </Button>
              <Button
                id="contact-add-submit"
                onClick={handleAdd}
                loading={addLoading}
                className="flex-1 bg-brandTeal hover:bg-brandTealGlow text-white border-none rounded-full"
              >
                Add Contact
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Contact List / Empty States */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="w-8 h-8 text-brandTeal" />
        </div>
      ) : contacts.length === 0 ? (
        <Card className="text-center py-12 sm:py-16 space-y-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-brandTeal/10 border border-brandTeal/20 rounded-2xl flex items-center justify-center mx-auto">
            <Users className="w-6 h-6 sm:w-7 sm:h-7 text-brandTeal" />
          </div>
          <div>
            <p className="text-primaryText font-bold text-base">No emergency contacts yet</p>
            <p className="text-mutedGray text-xs sm:text-sm mt-1 max-w-sm mx-auto">
              Add trusted ZeroGrid users who will be notified in case of an emergency.
            </p>
          </div>
          <Button
            id="contacts-empty-add"
            onClick={() => setShowAdd(true)}
            variant="primary"
            size="sm"
            className="mx-auto bg-brandTeal hover:bg-brandTealGlow text-white rounded-full mt-4 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Your First Contact
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {contacts.map(c => (
            <Card
              key={c.id}
              className="flex items-center gap-3 sm:gap-4 group hover:border-brandTeal/40 transition-all p-3 sm:p-4"
            >
              <div className="w-10 h-10 bg-brandTeal/10 border border-brandTeal/20 rounded-xl flex items-center justify-center text-brandTeal font-bold shrink-0">
                {c.contactUser.displayName?.[0]?.toUpperCase() ?? 'U'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-primaryText truncate text-sm sm:text-base">
                    {c.contactUser.displayName}
                  </p>
                  {c.label && (
                    <span className="text-[10px] sm:text-xs text-secondaryText bg-surfaceElevated border border-hairline px-2 py-0.5 rounded-full shrink-0">
                      {c.label}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1 sm:mt-0.5 text-[11px] sm:text-xs text-mutedGray">
                  <span className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{c.contactUser.email}</span>
                  </span>
                  {c.contactUser.phoneNumber && (
                    <span className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span className="truncate">{c.contactUser.phoneNumber}</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                id={`contact-delete-${c.id}`}
                onClick={() => handleDelete(c.id)}
                disabled={deleteId === c.id}
                className="text-mutedGray hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-500/10 shrink-0 ml-1"
                title="Remove Contact"
              >
                {deleteId === c.id ? <Spinner className="w-4 h-4 text-red-500" /> : <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}