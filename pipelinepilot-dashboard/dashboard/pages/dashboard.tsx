import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Guard from '../components/Guard';
import Nav from '../components/Nav';
import TenantOverview from '../components/TenantOverview';
import SecretHealth from '../components/SecretHealth';
import LastArvResult from '../components/LastArvResult';
import { useTenantData } from '../lib/hooks/useTenantData';
import { auth } from '../lib/firebase';

/**
 * Phase 5: Dashboard & Rollout
 *
 * Read-only dashboard showing:
 * - Tenant status (id, status, betaTier)
 * - Secret health (CLAY, APOLLO, CLEARBIT, CRUNCHBASE)
 * - Last ARV result for this tenant
 *
 * Beta tier behavior:
 * - internal: warnings as yellow, no blocking
 * - customer: missing secrets as red, action required
 */
export default function Dashboard() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Get tenant ID from auth token (set by Phase 2 middleware)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Get tenant_id from custom claims (set during onboarding)
        const idTokenResult = await user.getIdTokenResult();
        const tid = idTokenResult.claims.tenant_id as string | undefined;

        if (tid) {
          setTenantId(tid);
        } else {
          console.error('No tenant_id in user token');
          // User is authenticated but not assigned to a tenant yet
          setTenantId(null);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch tenant data, secrets, and ARV results
  const { tenant, secrets, arvResult, loading, error } = useTenantData(tenantId);

  if (!tenantId) {
    return (
      <Guard>
        <main>
          <Nav />
          <div className="container">
            <h1>Dashboard</h1>
            <div className="alert alert-warning">
              <strong>No Tenant Assigned</strong>
              <p>Your account is not yet assigned to a tenant. Please contact support.</p>
            </div>
          </div>
        </main>
      </Guard>
    );
  }

  if (loading) {
    return (
      <Guard>
        <main>
          <Nav />
          <div className="container">
            <h1>Dashboard</h1>
            <p>Loading tenant data...</p>
          </div>
        </main>
      </Guard>
    );
  }

  if (error) {
    return (
      <Guard>
        <main>
          <Nav />
          <div className="container">
            <h1>Dashboard</h1>
            <div className="alert alert-error">
              <strong>Error Loading Dashboard</strong>
              <p>{error}</p>
            </div>
          </div>
        </main>
      </Guard>
    );
  }

  return (
    <Guard>
      <main>
        <Nav />
        <div className="container">
          <h1>Dashboard</h1>
          <p className="subtitle">Status for tenant: {tenantId}</p>

          <div className="dashboard-grid">
            {/* Panel 1: Tenant Overview */}
            <TenantOverview tenant={tenant} />

            {/* Panel 2: Secret Health */}
            <SecretHealth
              secrets={secrets}
              betaTier={tenant?.betaTier || 'customer'}
            />

            {/* Panel 3: Last ARV Result */}
            <LastArvResult
              arvResult={arvResult}
              tenantId={tenantId}
              betaTier={tenant?.betaTier || 'customer'}
            />
          </div>
        </div>
      </main>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .subtitle {
          color: #666;
          margin-bottom: 2rem;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }

        @media (min-width: 768px) {
          .dashboard-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .alert {
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
        }

        .alert-warning {
          background: #fff3cd;
          border: 1px solid #ffc107;
          color: #856404;
        }

        .alert-error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }
      `}</style>
    </Guard>
  );
}
