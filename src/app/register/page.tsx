'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, UserPlus, LogIn, ArrowRight, CheckCircle2, AlertCircle, Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function RegisterPage() {
  const router = useRouter();

  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [invitationToken, setInvitationToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [chatUrl, setChatUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Auto-detect invitation query params: ?token=...&email=...
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const emailParam = params.get('email');
      if (token) setInvitationToken(token);
      if (emailParam) setEmail(emailParam);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            fullName,
            password,
            invitationToken: invitationToken || undefined,
            deviceName: 'Primary Workstation',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.message || 'Registration failed. Please check your credentials.');
          setLoading(false);
          return;
        }

        const directChat = `/?chatWith=${encodeURIComponent(data.user.email)}`;
        setChatUrl(directChat);
        setSuccess(`Account registered successfully! Welcome ${data.user.fullName}.`);
        setLoading(false);
      } else {
        // Sign in mode
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            deviceFingerprint: `web-fp-${Date.now()}`,
            deviceName: 'Browser Workstation',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.message || 'Invalid email or password.');
          setLoading(false);
          return;
        }

        router.push('/');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred. Ensure server is online.');
      setLoading(false);
    }
  };

  const copyChatLink = () => {
    if (chatUrl && typeof window !== 'undefined') {
      const fullUrl = `${window.location.origin}${chatUrl}`;
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-gcs-bg px-4 py-8 font-sans">
      {/* Background Ambience */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-gcs-emerald/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="relative w-full max-w-md bg-gcs-card border border-gcs-border rounded-2xl shadow-2xl p-6 sm:p-8 animate-fade-in">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gcs-emerald/15 border border-gcs-emerald/30 flex items-center justify-center text-gcs-mint mb-3 shadow-inner">
            <ShieldCheck className="w-8 h-8 text-gcs-emerald" />
          </div>
          <h1 className="text-xl font-bold text-gcs-text tracking-tight">
            {mode === 'register' ? 'Join GCS CONNECT' : 'Sign in to GCS CONNECT'}
          </h1>
          <p className="text-xs text-gcs-muted mt-1 max-w-xs">
            "Connect Freely. Communicate Securely."
            <br />
            Zero-knowledge, browser-based end-to-end encrypted messaging.
          </p>
        </div>

        {/* Success Banner */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-gcs-emerald/15 border border-gcs-emerald/40 text-gcs-mint text-xs flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-gcs-emerald shrink-0" />
              <span className="font-medium">{success}</span>
            </div>

            {chatUrl && (
              <div className="flex flex-col gap-2 pt-2 border-t border-gcs-emerald/30">
                <span className="text-[11px] text-gcs-muted">Direct Shareable Chat Link:</span>
                <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-lg border border-gcs-border font-mono text-[11px] text-gcs-mint break-all select-all">
                  <span className="truncate flex-1">{typeof window !== 'undefined' ? `${window.location.origin}${chatUrl}` : chatUrl}</span>
                  <button
                    type="button"
                    onClick={copyChatLink}
                    className="p-1 hover:text-white text-gcs-emerald transition-colors"
                    title="Copy Link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {copied && <span className="text-[10px] text-gcs-emerald font-semibold">✓ Link copied to clipboard!</span>}

                <Link href={chatUrl}>
                  <Button variant="primary" className="w-full mt-2 gap-2 text-xs h-9">
                    <span>Enter Encrypted Chat Now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-[#D94D55]/15 border border-[#D94D55]/40 text-[#ff8e95] text-xs flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        {!success && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <Input
                label="Full Name"
                placeholder="e.g. Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            )}

            <Input
              label="Corporate Email Address"
              type="email"
              placeholder="e.g. alex@globalcrestsolutions.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[32px] text-gcs-muted hover:text-gcs-mint transition-colors p-1"
                tabIndex={-1}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {mode === 'register' && (
              <Input
                label="Invitation Code (Optional)"
                placeholder="Paste onboarding token if invited"
                value={invitationToken}
                onChange={(e) => setInvitationToken(e.target.value)}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full mt-2 gap-2 h-10 text-sm font-semibold"
            >
              {loading ? (
                <span>Processing...</span>
              ) : mode === 'register' ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Register & Launch Chat</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to Chat</span>
                </>
              )}
            </Button>
          </form>
        )}

        {/* Toggle Mode */}
        <div className="mt-6 pt-5 border-t border-gcs-border/50 flex flex-col items-center gap-2.5 text-xs text-gcs-muted">
          {mode === 'register' ? (
            <p>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setSuccess(null);
                }}
                className="text-gcs-mint hover:underline font-semibold"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p>
              Need an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setSuccess(null);
                }}
                className="text-gcs-mint hover:underline font-semibold"
              >
                Create Account
              </button>
            </p>
          )}

          <Link href="/admin" className="text-[11px] text-gcs-emerald/80 hover:text-gcs-emerald flex items-center gap-1 transition-colors">
            <Lock className="w-3 h-3" />
            <span>Administrator Console Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
