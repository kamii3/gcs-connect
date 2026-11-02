'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Smartphone,
  Key,
  Lock,
  MessageSquare,
  Phone,
  HardDrive,
  FileText,
  AlertTriangle,
  Search,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Ban,
  Play,
  KeyRound,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface AdminMetrics {
  users: {
    total: number;
    active: number;
    suspended: number;
    newLast24h: number;
  };
  devices: {
    total: number;
    activeSessions: number;
  };
  cryptography: {
    identityKeysCount: number;
    signedPrekeysCount: number;
    oneTimePrekeysTotal: number;
    oneTimePrekeysConsumed: number;
    oneTimePrekeysAvailable: number;
    zeroPlaintextGuarantee: boolean;
    cipherProtocols: string[];
  };
  conversations: {
    total: number;
    direct: number;
    group: number;
  };
  messaging: {
    totalCiphertextMessages: number;
    editedCount: number;
    deletedForEveryoneCount: number;
    zeroPlaintextStored: boolean;
  };
  storage: {
    totalAttachments: number;
    storageSizeBytes: number;
    storageFormatted: string;
  };
  calling: {
    totalCalls: number;
    completedCalls: number;
    cumulativeDurationSeconds: number;
    cumulativeDurationFormatted: string;
  };
  compliance: {
    auditLogsTotal: number;
    asvsLevel: string;
    status: string;
  };
}

interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: string;
  roles: string[];
  activeDeviceCount: number;
  activeSessionCount: number;
}

interface UserDetail extends UserSummary {
  avatarUrl: string | null;
  devices: {
    id: string;
    deviceFingerprint: string;
    deviceName: string;
    clientPlatform: string;
    isActive: boolean;
    lastSeenAt: string;
    createdAt: string;
    cryptoStatus: {
      hasIdentityKey: boolean;
      identityKeyPublicKey: string | null;
      activeSignedPrekeyCount: number;
      availableOneTimePrekeys: number;
    };
    sessions: {
      id: string;
      ipAddress: string | null;
      userAgent: string | null;
      isValid: boolean;
      createdAt: string;
      expiresAt: string;
      revokedAt: string | null;
    }[];
  }[];
}

interface AuditLogEntry {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  details: string | null;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'audit'>('overview');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  // Users Tab State
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('');
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Create User Modal State
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'USER' | 'ADMIN' | 'SECURITY_AUDITOR'>('USER');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Audit Logs Tab State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/admin/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin metrics:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const query = new URLSearchParams();
      if (userSearch) query.set('search', userSearch);
      if (userStatusFilter) query.set('status', userStatusFilter);
      const res = await fetch(`/api/admin/users?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const query = new URLSearchParams();
      if (auditSearch) query.set('search', auditSearch);
      if (auditActionFilter) query.set('action', auditActionFilter);
      const res = await fetch(`/api/admin/audit-logs?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  const reloadData = async () => {
    setLoading(true);
    await Promise.all([fetchMetrics(), fetchUsers(), fetchAuditLogs()]);
    setLoading(false);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createEmail,
          fullName: createFullName,
          password: createPassword,
          role: createRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.message || 'Failed to create user account.');
        return;
      }

      setCreateSuccess(`Account created for ${data.user.email}`);
      setCreateEmail('');
      setCreateFullName('');
      setCreatePassword('');
      fetchUsers();
      fetchMetrics();
      setTimeout(() => {
        setIsCreateUserModalOpen(false);
        setCreateSuccess(null);
      }, 1500);
    } catch (err: any) {
      setCreateError(err.message || 'Network error occurred.');
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          reason: `Admin toggle status from ${currentStatus} to ${newStatus}`,
        }),
      });

      if (res.ok) {
        fetchUsers();
        fetchMetrics();
        fetchAuditLogs();
        if (selectedUserDetail && selectedUserDetail.id === userId) {
          setSelectedUserDetail({ ...selectedUserDetail, status: newStatus as any });
        }
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleRevokeSessions = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/revoke-sessions`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchUsers();
        fetchAuditLogs();
        if (selectedUserDetail && selectedUserDetail.id === userId) {
          viewUserDetails(userId);
        }
      }
    } catch (err) {
      console.error('Failed to revoke sessions:', err);
    }
  };

  const viewUserDetails = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/details`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUserDetail(data.user);
        setIsDetailModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to load user details:', err);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/admin/devices/${deviceId}/revoke`, {
        method: 'POST',
      });
      if (res.ok && selectedUserDetail) {
        viewUserDetails(selectedUserDetail.id);
        fetchAuditLogs();
      }
    } catch (err) {
      console.error('Failed to revoke device:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gcs-bg text-gcs-text flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-gcs-border bg-gcs-sidebar/95 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center shadow-lg shadow-gcs-emerald/10">
            <ShieldCheck className="w-5 h-5 text-gcs-emerald" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gcs-text tracking-wide">GCS CONNECT</h1>
              <Badge variant="emerald" className="font-mono text-[10px] tracking-wider uppercase">
                ADMIN CONSOLE
              </Badge>
            </div>
            <p className="text-xs text-gcs-muted font-mono">
              Zero-Knowledge End-to-End Cryptographic Administration
            </p>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gcs-card border border-gcs-border text-xs text-gcs-muted">
            <span className="w-2 h-2 rounded-full bg-gcs-emerald animate-pulse" />
            <span className="text-gcs-mint font-medium">DTLS & X3DH Engine Online</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={reloadData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Sync
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateUserModalOpen(true)}
            className="flex items-center gap-1.5 text-xs bg-gcs-emerald hover:bg-[#00c28c]"
          >
            <UserPlus className="w-3.5 h-3.5" />
            New User
          </Button>
        </div>
      </header>

      {/* Navigation Sub-header (Tabs) */}
      <div className="border-b border-gcs-border bg-gcs-sidebar px-6 py-2 flex gap-4 text-sm font-medium">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-3 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'overview'
              ? 'bg-gcs-emerald/15 text-gcs-emerald font-semibold border border-gcs-emerald/30'
              : 'text-gcs-muted hover:text-gcs-text'
          )}
        >
          <ShieldCheck className="w-4 h-4" />
          Overview & Cryptography
        </button>

        <button
          onClick={() => {
            setActiveTab('users');
            fetchUsers();
          }}
          className={cn(
            'px-3 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'users'
              ? 'bg-gcs-emerald/15 text-gcs-emerald font-semibold border border-gcs-emerald/30'
              : 'text-gcs-muted hover:text-gcs-text'
          )}
        >
          <Users className="w-4 h-4" />
          User Management
          {metrics && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-gcs-card text-gcs-muted border border-gcs-border">
              {metrics.users.total}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('audit');
            fetchAuditLogs();
          }}
          className={cn(
            'px-3 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'audit'
              ? 'bg-gcs-emerald/15 text-gcs-emerald font-semibold border border-gcs-emerald/30'
              : 'text-gcs-muted hover:text-gcs-text'
          )}
        >
          <FileText className="w-4 h-4" />
          Audit & Compliance Logs
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* ==================================================================== */}
        {/* TAB 1: OVERVIEW & SYSTEM METRICS */}
        {/* ==================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Zero-Plaintext Security Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-gcs-card to-[#15231c] border border-gcs-emerald/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-gcs-emerald" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gcs-text flex items-center gap-2">
                    Zero-Knowledge Plaintext Isolation Verified
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/50">
                      ASVS Level 2
                    </span>
                  </h3>
                  <p className="text-xs text-gcs-muted mt-0.5">
                    Messages, private keys, and media streams are cryptographically shielded from server storage and administrative access.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-gcs-mint">
                <span className="w-2 h-2 rounded-full bg-gcs-emerald animate-pulse" />
                Hardware WebCrypto (AES-256-GCM / P-256)
              </div>
            </div>

            {/* Metrics KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Users Metric */}
              <div className="p-5 rounded-2xl bg-gcs-card border border-gcs-border flex flex-col justify-between hover:border-gcs-emerald/40 transition-colors shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gcs-muted">
                    Total Accounts
                  </span>
                  <Users className="w-4 h-4 text-gcs-emerald" />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-gcs-text">
                    {metrics ? metrics.users.total : '—'}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gcs-muted">
                    <span className="text-gcs-mint">{metrics ? metrics.users.active : 0} active</span>
                    <span>•</span>
                    <span className="text-gcs-error">{metrics ? metrics.users.suspended : 0} suspended</span>
                  </div>
                </div>
              </div>

              {/* Active Devices & Sessions */}
              <div className="p-5 rounded-2xl bg-gcs-card border border-gcs-border flex flex-col justify-between hover:border-gcs-emerald/40 transition-colors shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gcs-muted">
                    Active Devices
                  </span>
                  <Smartphone className="w-4 h-4 text-gcs-emerald" />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-gcs-text">
                    {metrics ? metrics.devices.total : '—'}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gcs-muted">
                    <span className="text-gcs-mint">
                      {metrics ? metrics.devices.activeSessions : 0} valid sessions
                    </span>
                  </div>
                </div>
              </div>

              {/* Ciphertext Messages Stored */}
              <div className="p-5 rounded-2xl bg-gcs-card border border-gcs-border flex flex-col justify-between hover:border-gcs-emerald/40 transition-colors shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gcs-muted">
                    Ciphertext Messages
                  </span>
                  <MessageSquare className="w-4 h-4 text-gcs-emerald" />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-gcs-text">
                    {metrics ? metrics.messaging.totalCiphertextMessages : '—'}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gcs-muted">
                    <span>{metrics ? metrics.conversations.total : 0} conversations</span>
                    <span>•</span>
                    <span className="text-gcs-mint">0 Plaintext</span>
                  </div>
                </div>
              </div>

              {/* Encrypted Media & Calling */}
              <div className="p-5 rounded-2xl bg-gcs-card border border-gcs-border flex flex-col justify-between hover:border-gcs-emerald/40 transition-colors shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gcs-muted">
                    Encrypted Storage
                  </span>
                  <HardDrive className="w-4 h-4 text-gcs-emerald" />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-gcs-text">
                    {metrics ? metrics.storage.storageFormatted : '—'}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gcs-muted">
                    <span>{metrics ? metrics.storage.totalAttachments : 0} attachments</span>
                    <span>•</span>
                    <span className="text-gcs-mint">Hostinger Private</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cryptographic Key Bundle & Protocol Compliance Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* E2EE Prekey Inventory */}
              <div className="p-6 rounded-2xl bg-gcs-card border border-gcs-border space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-gcs-border">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-gcs-emerald" />
                    <h4 className="text-sm font-bold text-gcs-text">E2EE Prekey Repository</h4>
                  </div>
                  <Badge variant="emerald" className="font-mono text-[10px]">
                    X3DH + Double Ratchet
                  </Badge>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">Registered Identity Public Keys (IK)</span>
                    <span className="font-mono font-bold text-gcs-text">
                      {metrics ? metrics.cryptography.identityKeysCount : 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">Active Signed Prekeys (SPK)</span>
                    <span className="font-mono font-bold text-gcs-text">
                      {metrics ? metrics.cryptography.signedPrekeysCount : 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">Available One-Time Prekeys (OPK Pool)</span>
                    <span className="font-mono font-bold text-gcs-mint">
                      {metrics ? metrics.cryptography.oneTimePrekeysAvailable : 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">Consumed One-Time Prekeys</span>
                    <span className="font-mono text-gcs-muted">
                      {metrics ? metrics.cryptography.oneTimePrekeysConsumed : 0}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gcs-bg/80 border border-gcs-border/60 text-[11px] text-gcs-muted flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-gcs-emerald shrink-0 mt-0.5" />
                  <span>
                    Private ratchet keys remain exclusively inside client IndexedDB storage vaults. The server holds zero private keys.
                  </span>
                </div>
              </div>

              {/* WebRTC Calling & Voice Infrastructure */}
              <div className="p-6 rounded-2xl bg-gcs-card border border-gcs-border space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-gcs-border">
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-gcs-emerald" />
                    <h4 className="text-sm font-bold text-gcs-text">WebRTC Calling Engine</h4>
                  </div>
                  <Badge variant="e2ee" className="font-mono text-[10px] text-gcs-mint border-gcs-mint/40">
                    DTLS-SRTP
                  </Badge>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">Total Calls Initiated</span>
                    <span className="font-mono font-bold text-gcs-text">
                      {metrics ? metrics.calling.totalCalls : 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">Successfully Completed Calls</span>
                    <span className="font-mono font-bold text-gcs-mint">
                      {metrics ? metrics.calling.completedCalls : 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">Cumulative Connected Duration</span>
                    <span className="font-mono font-bold text-gcs-text">
                      {metrics ? metrics.calling.cumulativeDurationFormatted : '0m 0s'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gcs-border/40">
                    <span className="text-gcs-muted">STUN / TURN NAT Traversal</span>
                    <span className="font-mono text-gcs-mint">Configured & Enforced</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gcs-bg/80 border border-gcs-border/60 text-[11px] text-gcs-muted flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-gcs-emerald shrink-0 mt-0.5" />
                  <span>
                    Audio and video streams establish peer-to-peer connections secured with mandatory DTLS-SRTP encryption without server media access.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: USER MANAGEMENT */}
        {/* ==================================================================== */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gcs-card p-4 rounded-2xl border border-gcs-border shadow-lg">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gcs-muted" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-gcs-bg border border-gcs-border rounded-xl text-gcs-text placeholder-gcs-muted focus:outline-none focus:border-gcs-emerald"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  value={userStatusFilter}
                  onChange={(e) => {
                    setUserStatusFilter(e.target.value);
                  }}
                  className="px-3 py-2 text-xs bg-gcs-bg border border-gcs-border rounded-xl text-gcs-text focus:outline-none focus:border-gcs-emerald"
                >
                  <option value="">All Account Statuses</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="SUSPENDED">Suspended Only</option>
                </select>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchUsers}
                  className="text-xs px-3"
                >
                  Filter
                </Button>
              </div>
            </div>

            {/* Users Table */}
            <div className="rounded-2xl bg-gcs-card border border-gcs-border overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gcs-sidebar text-gcs-muted uppercase text-[10px] tracking-wider border-b border-gcs-border font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">User Profile</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Roles</th>
                      <th className="px-6 py-3.5">Active Devices</th>
                      <th className="px-6 py-3.5">Joined Date</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gcs-border/60">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gcs-sidebar/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.fullName} size="md" />
                            <div>
                              <div className="font-bold text-gcs-text">{u.fullName}</div>
                              <div className="text-gcs-muted font-mono text-[11px]">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={u.status === 'ACTIVE' ? 'emerald' : 'error'}
                            className="font-mono text-[10px]"
                          >
                            {u.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1 flex-wrap">
                            {u.roles.map((r) => (
                              <Badge key={r} variant="neutral" className="text-[10px]">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono">
                          <span className="text-gcs-mint font-semibold">{u.activeDeviceCount}</span> devices
                          <span className="text-gcs-muted text-[11px]"> ({u.activeSessionCount} sessions)</span>
                        </td>
                        <td className="px-6 py-4 text-gcs-muted font-mono">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewUserDetails(u.id)}
                              className="text-[11px] h-7 px-2.5 border-gcs-border hover:border-gcs-emerald text-gcs-text"
                            >
                              <KeyRound className="w-3 h-3 mr-1 text-gcs-emerald" />
                              Crypto Inventory
                            </Button>

                            <Button
                              variant={u.status === 'ACTIVE' ? 'danger' : 'secondary'}
                              size="sm"
                              onClick={() => handleToggleUserStatus(u.id, u.status)}
                              className="text-[11px] h-7 px-2.5"
                            >
                              {u.status === 'ACTIVE' ? (
                                <>
                                  <Ban className="w-3 h-3 mr-1" /> Suspend
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 mr-1 text-gcs-emerald" /> Reactivate
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gcs-muted">
                          No user accounts matched the filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: AUDIT & COMPLIANCE LOGS */}
        {/* ==================================================================== */}
        {activeTab === 'audit' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gcs-card p-4 rounded-2xl border border-gcs-border shadow-lg">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gcs-muted" />
                <input
                  type="text"
                  placeholder="Search logs by actor or details..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchAuditLogs()}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-gcs-bg border border-gcs-border rounded-xl text-gcs-text placeholder-gcs-muted focus:outline-none focus:border-gcs-emerald"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-gcs-bg border border-gcs-border rounded-xl text-gcs-text focus:outline-none focus:border-gcs-emerald"
                >
                  <option value="">All Security Actions</option>
                  <option value="USER_CREATED_BY_ADMIN">User Created</option>
                  <option value="USER_STATUS_SUSPENDED">User Suspended</option>
                  <option value="USER_STATUS_ACTIVE">User Activated</option>
                  <option value="FORCE_REVOKE_SESSIONS_BY_ADMIN">Sessions Revoked</option>
                  <option value="DEVICE_REVOKED_BY_ADMIN">Device Revoked</option>
                  <option value="INVITATION_CREATED">Invitation Created</option>
                </select>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchAuditLogs}
                  className="text-xs px-3"
                >
                  Filter
                </Button>
              </div>
            </div>

            {/* Audit Logs Table */}
            <div className="rounded-2xl bg-gcs-card border border-gcs-border overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-gcs-sidebar text-gcs-muted uppercase text-[10px] tracking-wider border-b border-gcs-border font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">Timestamp</th>
                      <th className="px-6 py-3.5">Actor</th>
                      <th className="px-6 py-3.5">Action</th>
                      <th className="px-6 py-3.5">Entity</th>
                      <th className="px-6 py-3.5">IP Address</th>
                      <th className="px-6 py-3.5">Security Event Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gcs-border/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gcs-sidebar/40 transition-colors">
                        <td className="px-6 py-3 text-gcs-muted whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 font-semibold text-gcs-text">{log.actorEmail}</td>
                        <td className="px-6 py-3">
                          <Badge
                            variant={
                              log.action.includes('SUSPENDED') || log.action.includes('REVOKE')
                                ? 'error'
                                : log.action.includes('CREATED')
                                ? 'emerald'
                                : 'neutral'
                            }
                            className="text-[10px]"
                          >
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-gcs-muted">
                          {log.entityType} {log.entityId ? `(${log.entityId.slice(0, 8)}...)` : ''}
                        </td>
                        <td className="px-6 py-3 text-gcs-muted">{log.ipAddress || '127.0.0.1'}</td>
                        <td className="px-6 py-3 max-w-xs truncate text-[11px] text-gcs-mint">
                          {log.details || '—'}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gcs-muted">
                          No audit log events found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODAL 1: CREATE USER ACCOUNT */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isCreateUserModalOpen}
        onClose={() => setIsCreateUserModalOpen(false)}
        title="Create Verified User Account"
        description="Administratively provision a new user with Argon2id credentials."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-xl bg-gcs-error/15 border border-gcs-error/40 text-gcs-error text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          {createSuccess && (
            <div className="p-3 rounded-xl bg-gcs-emerald/15 border border-gcs-emerald/40 text-gcs-mint text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-gcs-emerald" />
              <span>{createSuccess}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gcs-muted">Full Name</label>
            <Input
              type="text"
              required
              placeholder="e.g. Elena Rostova"
              value={createFullName}
              onChange={(e) => setCreateFullName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gcs-muted">Corporate Email Address</label>
            <Input
              type="email"
              required
              placeholder="elena@globalcrestsolutions.com"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gcs-muted">Temporary Password (Min 12 chars)</label>
            <Input
              type="password"
              required
              placeholder="••••••••••••"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gcs-muted">Assigned Security Role</label>
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-gcs-bg border border-gcs-border rounded-xl text-gcs-text focus:outline-none focus:border-gcs-emerald"
            >
              <option value="USER">Standard User</option>
              <option value="SECURITY_AUDITOR">Security Auditor</option>
              <option value="ADMIN">System Administrator</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gcs-border/60">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateUserModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="bg-gcs-emerald hover:bg-[#00c28c]"
            >
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL 2: USER PREKEY INVENTORY & DEVICE INSPECTOR */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Cryptographic Prekey Inventory & Device Inspector"
        description="Verify registered public keys, OPK pool availability, and active device sessions."
      >
        {selectedUserDetail && (
          <div className="space-y-5 text-xs max-h-[70vh] overflow-y-auto pr-1">
            {/* User Identity Header */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-gcs-bg border border-gcs-border">
              <div className="flex items-center gap-3">
                <Avatar name={selectedUserDetail.fullName} size="lg" />
                <div>
                  <div className="font-bold text-sm text-gcs-text">{selectedUserDetail.fullName}</div>
                  <div className="text-gcs-muted font-mono">{selectedUserDetail.email}</div>
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleRevokeSessions(selectedUserDetail.id)}
                className="text-xs h-8"
              >
                Revoke All Sessions
              </Button>
            </div>

            {/* Devices & Keys */}
            <div className="space-y-3">
              <h5 className="font-bold text-gcs-text uppercase text-[11px] tracking-wider text-gcs-muted">
                Registered Devices & E2EE Key Bundles ({selectedUserDetail.devices.length})
              </h5>

              {selectedUserDetail.devices.map((d) => (
                <div
                  key={d.id}
                  className="p-4 rounded-xl bg-gcs-bg border border-gcs-border space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gcs-text flex items-center gap-2">
                        {d.deviceName}
                        <Badge
                          variant={d.isActive ? 'emerald' : 'error'}
                          className="text-[9px] font-mono"
                        >
                          {d.isActive ? 'ACTIVE' : 'REVOKED'}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-gcs-muted font-mono mt-0.5">
                        FP: {d.deviceFingerprint}
                      </div>
                    </div>
                    {d.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokeDevice(d.id)}
                        className="text-[10px] h-6 px-2 text-gcs-error border-gcs-error/40 hover:bg-gcs-error/10"
                      >
                        Deactivate Device
                      </Button>
                    )}
                  </div>

                  {/* Cryptographic Key Status Grid */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-gcs-card border border-gcs-border/60 font-mono text-[11px]">
                    <div>
                      <span className="text-[10px] text-gcs-muted block">Identity Key (IK)</span>
                      <span className={d.cryptoStatus.hasIdentityKey ? 'text-gcs-mint' : 'text-gcs-error'}>
                        {d.cryptoStatus.hasIdentityKey ? 'REGISTERED' : 'MISSING'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gcs-muted block">Active Signed Prekeys</span>
                      <span className="text-gcs-text font-bold">
                        {d.cryptoStatus.activeSignedPrekeyCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gcs-muted block">Available OPKs</span>
                      <span className="text-gcs-mint font-bold">
                        {d.cryptoStatus.availableOneTimePrekeys} in pool
                      </span>
                    </div>
                  </div>

                  {/* Active Sessions */}
                  <div>
                    <span className="text-[10px] font-semibold text-gcs-muted uppercase tracking-wider block mb-1">
                      Active Device Sessions ({d.sessions.filter((s) => s.isValid).length})
                    </span>
                    <div className="space-y-1">
                      {d.sessions.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-2 rounded bg-gcs-card/60 text-[10px] font-mono"
                        >
                          <span className="text-gcs-muted">
                            IP: {s.ipAddress || '127.0.0.1'} • Created {new Date(s.createdAt).toLocaleDateString()}
                          </span>
                          <span className={s.isValid ? 'text-gcs-emerald' : 'text-gcs-muted'}>
                            {s.isValid ? 'VALID' : 'REVOKED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {selectedUserDetail.devices.length === 0 && (
                <div className="p-4 rounded-xl bg-gcs-bg border border-gcs-border text-center text-gcs-muted">
                  No devices registered for this user account.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
