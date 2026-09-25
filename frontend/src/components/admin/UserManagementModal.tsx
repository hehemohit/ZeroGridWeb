'use client';

import React from 'react';
import { Users, Search, Shield, User, X, Loader2 } from 'lucide-react';

export interface AdminUserUI {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  nodeType: 'AUTHORITY' | 'REGULAR';
  nodeAddress: string;
  status: 'Active' | 'Standby';
}

interface UserManagementModalProps {
  isOpen: boolean;
  userSearch: string;
  users: AdminUserUI[];
  isLoading: boolean;
  onClose: () => void;
  onUserSearchChange: (val: string) => void;
  onPromoteAdmin: (userEmail: string, userName: string) => void;
  onDemoteAdmin: (userId: string, userName: string) => void;
}

export function UserManagementModal({
  isOpen,
  userSearch,
  users,
  isLoading,
  onClose,
  onUserSearchChange,
  onPromoteAdmin,
  onDemoteAdmin,
}: UserManagementModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl h-[85vh] bg-surface rounded-16dp border border-hairlineBright shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-hairline flex items-center justify-between bg-surfaceElevated">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brandTealDark border border-brandTeal/30 flex items-center justify-center text-brandTeal shadow-glow-teal">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-primaryText font-display">User & Node Authority Management</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surfaceCard text-mutedGray border border-hairline">
                  GET /api/admin/users
                </span>
              </div>
              <p className="text-xs text-mutedGray mt-0.5">
                Manage ZeroGrid peer nodes, promote field dispatchers, and revoke admin privileges.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-hairline hover:bg-surfaceCard flex items-center justify-center text-mutedGray hover:text-primaryText transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar for Users */}
        <div className="p-4 border-b border-hairline bg-canvas flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-mutedGray absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => onUserSearchChange(e.target.value)}
              placeholder="Search users by name, email, or mesh address (GET /api/admin/users?q=)..."
              className="w-full bg-surface border border-hairline rounded-xl pl-9 pr-3 py-2 text-xs text-primaryText placeholder-dimGray focus:outline-none focus:border-brandTeal"
            />
          </div>
          <div className="text-xs text-mutedGray font-mono">
            Total Nodes: <span className="text-brandTeal">{users.length}</span>
          </div>
        </div>

        {/* User Table / List */}
        <div className="flex-1 overflow-y-auto p-4 bg-canvas">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-brandTeal gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-semibold text-primaryText">Querying User Directory...</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-hairline text-mutedGray font-semibold uppercase text-[10px] tracking-wider font-mono">
                  <th className="pb-3 pl-3">Node / User</th>
                  <th className="pb-3">Role & Token</th>
                  <th className="pb-3">Mesh Hardware</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 pr-3 text-right">Authority Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-mutedGray">
                      No users found matching query.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isAdmin = u.role === 'ADMIN';
                    return (
                      <tr key={u.id} className="hover:bg-surfaceCard/60 transition-colors">
                        {/* User Info */}
                        <td className="py-3.5 pl-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                isAdmin
                                  ? 'bg-brandTealDark text-brandTeal border border-brandTeal/30 shadow-glow-teal'
                                  : 'bg-surfaceElevated text-secondaryText border border-hairline'
                              }`}
                            >
                              {isAdmin ? (
                                <Shield className="w-4 h-4" />
                              ) : (
                                <User className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-primaryText">{u.name}</div>
                              <div className="text-[11px] text-mutedGray font-mono">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${
                              isAdmin
                                ? 'bg-brandTealDark text-brandTeal border border-brandTeal/30'
                                : 'bg-surfaceElevated text-mutedGray border border-hairline'
                            }`}
                          >
                            {isAdmin ? 'Admin / Authority' : 'Citizen Node'}
                          </span>
                        </td>

                        {/* Mesh Hardware */}
                        <td className="py-3.5 font-mono text-mutedGray text-[11px]">
                          {u.nodeAddress}
                        </td>

                        {/* Status */}
                        <td className="py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-secondaryText">
                            <span className="w-1.5 h-1.5 rounded-full bg-brandTeal shadow-glow-teal"></span>
                            {u.status}
                          </span>
                        </td>

                        {/* Actions (Strict API: POST /api/admin/admins, DELETE /api/admin/admins/:userId) */}
                        <td className="py-3.5 pr-3 text-right">
                          {isAdmin ? (
                            <button
                              onClick={() => onDemoteAdmin(u.id, u.name)}
                              className="px-3 py-1.5 rounded-16dp bg-surfaceCard hover:bg-surfaceElevated border border-hairline text-mutedGray hover:text-primaryText font-medium text-xs transition-colors"
                              title="DELETE /api/admin/admins/:userId"
                            >
                              Revoke Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => onPromoteAdmin(u.email, u.name)}
                              className="px-3 py-1.5 rounded-16dp bg-brandTeal hover:bg-brandTealGlow text-canvas font-bold text-xs transition-colors shadow-glow-teal"
                              title="POST /api/admin/admins"
                            >
                              Promote to Admin
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-hairline bg-surface flex items-center justify-between text-xs text-mutedGray">
          <span>Backend Protocol: ZeroGrid Auth v2.1 • All queries executed on live node registry</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-surfaceElevated border border-hairlineBright rounded-16dp text-primaryText font-semibold hover:bg-surfaceCard"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
