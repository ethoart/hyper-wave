import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [isRegister, setIsRegister] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await axios.post('/api/auth/register', { email, password });
        // Automatically login after register
        const res = await axios.post('/api/auth/login', { email, password });
        login(res.data.token, res.data.user);
      } else {
        const res = await axios.post('/api/auth/login', { email, password });
        login(res.data.token, res.data.user);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || (isRegister ? 'Registration failed' : 'Login failed'));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] font-sans flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#3b82f6] opacity-[0.03] rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="text-center mb-10">
        <h1 className="text-[32px] font-bold text-[#fff] m-0 mb-1 flex items-center justify-center gap-3">
          <span className="serif italic">Hyperway</span>
        </h1>
        <p className="text-[#666] text-[13px] tracking-[0.05em] uppercase">Professional Analysis System</p>
      </div>

      <Card className="w-full max-w-[360px] border-[#222] bg-[#111] rounded-[8px] shadow-2xl">
        <CardHeader className="p-6 pb-4 border-b border-[#1a1a1a]">
          <CardTitle className="text-[18px] text-[#fff] font-medium m-0">{isRegister ? 'Register New User' : 'System Authentication'}</CardTitle>
          <CardDescription className="text-[#888] text-[13px] mt-2 leading-[1.6]">
            {isRegister ? 'Create an account to access the framework.' : 'Secure connection to analysis framework.'}<br/>
            <span className="text-[#555] mt-2 block">
              <span className="text-[#10b981]">Demo mode active:</span><br/>
              admin@admin.com / admin123<br/>
              user@user.com / user123
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-950/30 border border-red-900 text-red-500 text-[12px] rounded uppercase tracking-[0.05em]">
                SYS_ERR: {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-[0.05em] text-[#666]">Identifier</label>
              <Input 
                type="email" 
                required 
                value={email}
                onChange={(e: any) => setEmail(e.target.value)}
                className="bg-[#0a0a0a] border-[#1a1a1a] focus:border-[#3b82f6] text-[#fff] h-[40px] rounded-[6px]" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-[0.05em] text-[#666]">Security Key</label>
              <Input 
                type="password" 
                required 
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
                className="bg-[#0a0a0a] border-[#1a1a1a] focus:border-[#3b82f6] text-[#fff] h-[40px] rounded-[6px]" 
              />
            </div>
            <button 
              type="submit" 
              className="w-full mt-6 py-[12px] bg-[#fff] text-[#000] font-bold rounded-[6px] text-[13px] tracking-[0.05em] uppercase hover:bg-[#e5e5e5] transition-colors disabled:opacity-50 cursor-pointer" 
              disabled={loading}
            >
              {loading ? (isRegister ? 'REGISTERING...' : 'AUTHENTICATING...') : (isRegister ? 'CREATE ACCOUNT' : 'ESTABLISH CONNECTION')}
            </button>
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); setError(''); }}
                className="text-[12px] text-[#888] hover:text-[#fff] underline"
              >
                {isRegister ? 'Already have an account? Sign in' : 'Need an account? Register'}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
