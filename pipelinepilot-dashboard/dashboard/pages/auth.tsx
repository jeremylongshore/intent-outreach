import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';

/**
 * Authentication Page
 *
 * Provides email/password and Google sign-in
 * After successful auth:
 * 1. Check if user has tenant_id in custom claims
 * 2. If yes, redirect to /beta
 * 3. If no, call createTenantForUser Cloud Function
 */
export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already logged in
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // User is already logged in, redirect to beta dashboard
        router.push('/beta');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Handle email/password sign in
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle redirect
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  // Handle email/password sign up
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // After sign up, call createTenantForUser
      await createTenantForNewUser(userCredential.user.uid, email);

      // Redirect to beta dashboard
      router.push('/beta');
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(err.message || 'Failed to create account');
      setLoading(false);
    }
  };

  // Handle Google sign in
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);

      // Check if user already has tenant_id
      const idTokenResult = await userCredential.user.getIdTokenResult();
      const tenantId = idTokenResult.claims.tenant_id;

      if (!tenantId) {
        // New user, create tenant
        await createTenantForNewUser(
          userCredential.user.uid,
          userCredential.user.email || ''
        );
      }

      // Redirect to beta dashboard
      router.push('/beta');
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  // Call createTenantForUser Cloud Function
  const createTenantForNewUser = async (uid: string, email: string) => {
    try {
      // Get ID token for authentication
      const user = auth.currentUser;
      if (!user) throw new Error('No authenticated user');

      const token = await user.getIdToken();

      // Call Cloud Function
      const response = await fetch(
        `https://us-central1-pipelinepilot-prod.cloudfunctions.net/createTenantForUser`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uid,
            email,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create tenant');
      }

      const data = await response.json();
      console.log('Tenant created:', data.tenantId);

      // Force token refresh to get new custom claims
      await user.getIdToken(true);
    } catch (err) {
      console.error('Error creating tenant:', err);
      throw err;
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>PipelinePilot <span className="beta">BETA</span></h1>
          <p>{mode === 'signin' ? 'Sign in to your account' : 'Create your account'}</p>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={mode === 'signin' ? handleEmailSignIn : handleEmailSignUp}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="divider">
          <span>or</span>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="btn btn-google"
          disabled={loading}
        >
          <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd">
              <path
                d="M17.6 9.2l-.1-1.8H9v3.4h4.8C13.6 12 13 13 12 13.6v2.2h3a8.8 8.8 0 0 0 2.6-6.6z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.4 0 4.5-.8 6-2.2l-3-2.2a5.4 5.4 0 0 1-8-2.9H1V13a9 9 0 0 0 8 5z"
                fill="#34A853"
              />
              <path d="M4 10.7a5.4 5.4 0 0 1 0-3.4V5H1a9 9 0 0 0 0 8l3-2.3z" fill="#FBBC05" />
              <path
                d="M9 3.6c1.3 0 2.5.4 3.4 1.3L15 2.3A9 9 0 0 0 1 5l3 2.4a5.4 5.4 0 0 1 5-3.7z"
                fill="#EA4335"
              />
            </g>
          </svg>
          Continue with Google
        </button>

        <div className="auth-switch">
          {mode === 'signin' ? (
            <p>
              Don't have an account?{' '}
              <button onClick={() => setMode('signup')} className="link-button">
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button onClick={() => setMode('signin')} className="link-button">
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 2rem;
        }

        .auth-container {
          background: white;
          border-radius: 12px;
          padding: 3rem;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }

        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .auth-header h1 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 2rem;
        }

        .beta {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          margin-left: 0.5rem;
        }

        .auth-header p {
          margin: 0;
          color: #666;
        }

        .alert {
          padding: 0.75rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .alert-error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          color: #333;
          font-size: 0.875rem;
        }

        .form-group input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-group input:disabled {
          background: #f8f9fa;
          cursor: not-allowed;
        }

        .btn {
          width: 100%;
          padding: 0.75rem;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .btn-google {
          background: white;
          color: #333;
          border: 1px solid #dee2e6;
        }

        .btn-google:hover:not(:disabled) {
          background: #f8f9fa;
          border-color: #667eea;
        }

        .divider {
          position: relative;
          text-align: center;
          margin: 1.5rem 0;
        }

        .divider::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: #dee2e6;
        }

        .divider span {
          position: relative;
          background: white;
          padding: 0 1rem;
          color: #999;
          font-size: 0.875rem;
        }

        .auth-switch {
          text-align: center;
          margin-top: 1.5rem;
        }

        .auth-switch p {
          margin: 0;
          color: #666;
          font-size: 0.875rem;
        }

        .link-button {
          background: none;
          border: none;
          color: #667eea;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
        }

        .link-button:hover {
          color: #764ba2;
        }
      `}</style>
    </div>
  );
}
