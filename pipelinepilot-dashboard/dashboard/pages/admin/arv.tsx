import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Guard from '../../components/Guard';
import Nav from '../../components/Nav';
import { db, auth } from '../../lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import type { ArvResult, Tenant } from '../../lib/hooks/useTenantData';

/**
 * Admin ARV Dashboard
 *
 * Displays latest 20 ARV runs from /system/arv-runs/runs
 * Grouped by beta tier (internal vs customer)
 * Failed tenants shown at top
 *
 * Access: Admin users only (check custom claims)
 */
export default function AdminArv() {
  const router = useRouter();
  const [arvRuns, setArvRuns] = useState<ArvResult[]>([]);
  const [tenants, setTenants] = useState<Map<string, Tenant>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        router.push('/auth');
        return;
      }

      const idTokenResult = await user.getIdTokenResult();
      const adminClaim = idTokenResult.claims.admin as boolean | undefined;

      if (!adminClaim) {
        setError('Access denied: Admin role required');
        setIsAdmin(false);
        return;
      }

      setIsAdmin(true);
    };

    checkAdmin();
  }, [router]);

  // Fetch ARV runs
  useEffect(() => {
    if (!isAdmin) return;

    const fetchArvRuns = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch latest 20 ARV runs
        const arvQuery = query(
          collection(db, 'system', 'arv-runs', 'runs'),
          orderBy('timestamp', 'desc'),
          limit(20)
        );

        const arvSnapshot = await getDocs(arvQuery);
        const runs: ArvResult[] = [];

        arvSnapshot.forEach((arvDoc) => {
          runs.push({
            ...arvDoc.data(),
          } as ArvResult);
        });

        setArvRuns(runs);

        // Fetch tenant details for each unique tenant in failures
        const tenantIds = new Set<string>();
        runs.forEach((run) => {
          run.failures?.forEach((failure) => {
            tenantIds.add(failure.tenantId);
          });
        });

        const tenantMap = new Map<string, Tenant>();
        for (const tenantId of tenantIds) {
          try {
            const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
            if (tenantDoc.exists()) {
              tenantMap.set(tenantId, {
                tenant_id: tenantDoc.id,
                ...tenantDoc.data(),
              } as Tenant);
            }
          } catch (err) {
            console.error(`Error fetching tenant ${tenantId}:`, err);
          }
        }

        setTenants(tenantMap);
      } catch (err) {
        console.error('Error fetching ARV runs:', err);
        setError((err as Error).message || 'Failed to load ARV runs');
      } finally {
        setLoading(false);
      }
    };

    fetchArvRuns();
  }, [isAdmin]);

  if (!isAdmin && error) {
    return (
      <Guard>
        <main>
          <Nav />
          <div className="container">
            <div className="alert alert-error">
              <strong>Access Denied</strong>
              <p>{error}</p>
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
            <h1>Admin ARV Dashboard</h1>
            <p>Loading ARV runs...</p>
          </div>
        </main>
      </Guard>
    );
  }

  // Group runs by tenants with failures
  const failedTenants = new Map<string, ArvResult[]>();
  arvRuns.forEach((run) => {
    run.failures?.forEach((failure) => {
      if (!failedTenants.has(failure.tenantId)) {
        failedTenants.set(failure.tenantId, []);
      }
      failedTenants.get(failure.tenantId)!.push(run);
    });
  });

  // Sort by beta tier (customer first, then internal)
  const sortedTenants = Array.from(failedTenants.keys()).sort((a, b) => {
    const tenantA = tenants.get(a);
    const tenantB = tenants.get(b);

    const tierA = tenantA?.betaTier || 'customer';
    const tierB = tenantB?.betaTier || 'customer';

    if (tierA === 'customer' && tierB === 'internal') return -1;
    if (tierA === 'internal' && tierB === 'customer') return 1;
    return 0;
  });

  return (
    <Guard>
      <main>
        <Nav />
        <div className="container">
          <h1>Admin ARV Dashboard</h1>
          <p className="subtitle">Latest 20 ARV runs</p>

          {/* Summary stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{arvRuns.length}</div>
              <div className="stat-label">Total Runs</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{failedTenants.size}</div>
              <div className="stat-label">Tenants with Failures</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {arvRuns.filter((r) => r.critical).length}
              </div>
              <div className="stat-label">Critical Runs</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {arvRuns.filter((r) => r.ok).length}
              </div>
              <div className="stat-label">Passing Runs</div>
            </div>
          </div>

          {/* Tenants with failures (grouped by beta tier) */}
          {failedTenants.size > 0 && (
            <div className="section">
              <h2>Tenants with Failures</h2>

              {sortedTenants.map((tenantId) => {
                const tenant = tenants.get(tenantId);
                const runs = failedTenants.get(tenantId)!;

                return (
                  <div key={tenantId} className="tenant-card">
                    <div className="tenant-header">
                      <div>
                        <h3>{tenantId}</h3>
                        {tenant && (
                          <div className="tenant-meta">
                            <span className="status-badge">{tenant.status}</span>
                            <span
                              className="tier-badge"
                              style={{
                                backgroundColor:
                                  tenant.betaTier === 'internal'
                                    ? '#ffc107'
                                    : '#17a2b8',
                              }}
                            >
                              {tenant.betaTier?.toUpperCase() || 'CUSTOMER'}
                            </span>
                            <span className="email">{tenant.email}</span>
                          </div>
                        )}
                      </div>

                      <div className="failure-count">
                        {runs.length} runs with failures
                      </div>
                    </div>

                    {/* Latest run for this tenant */}
                    {runs[0] && (
                      <div className="run-details">
                        <div className="run-header">
                          <span>Latest Run</span>
                          <span className="timestamp">
                            {new Date(runs[0].finishedAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="failures-list">
                          {runs[0].failures
                            ?.filter((f) => f.tenantId === tenantId)
                            .map((failure, idx) => (
                              <div key={idx} className="failure-item">
                                <span
                                  className="severity"
                                  style={{
                                    backgroundColor:
                                      failure.severity === 'critical'
                                        ? '#dc3545'
                                        : '#ffc107',
                                  }}
                                >
                                  {failure.severity}
                                </span>
                                <span className="check">{failure.check}</span>
                                <span className="reason">{failure.reason}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* All ARV runs */}
          <div className="section">
            <h2>All Runs (Latest 20)</h2>

            <div className="runs-table">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Status</th>
                    <th>Tenants Checked</th>
                    <th>Passed</th>
                    <th>Failed</th>
                    <th>Warning</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {arvRuns.map((run, idx) => (
                    <tr key={idx}>
                      <td>{new Date(run.finishedAt).toLocaleString()}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: run.critical
                              ? '#dc3545'
                              : run.ok
                              ? '#28a745'
                              : '#ffc107',
                          }}
                        >
                          {run.critical ? 'CRITICAL' : run.ok ? 'PASS' : 'WARN'}
                        </span>
                      </td>
                      <td>{run.tenantsChecked}</td>
                      <td>{run.tenantsPassed}</td>
                      <td>{run.tenantsFailed}</td>
                      <td>{run.tenantsWarning}</td>
                      <td>{run.durationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <style jsx>{`
          .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
          }

          .subtitle {
            color: #666;
            margin-bottom: 2rem;
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
          }

          .stat-card {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            text-align: center;
          }

          .stat-value {
            font-size: 3rem;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 0.5rem;
          }

          .stat-label {
            color: #666;
            font-size: 0.875rem;
          }

          .section {
            margin-bottom: 3rem;
          }

          .section h2 {
            margin-bottom: 1.5rem;
            color: #333;
          }

          .tenant-card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .tenant-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid #eee;
          }

          .tenant-header h3 {
            margin: 0 0 0.5rem 0;
            font-family: 'Courier New', monospace;
            font-size: 1rem;
            color: #333;
          }

          .tenant-meta {
            display: flex;
            gap: 0.5rem;
            align-items: center;
          }

          .status-badge,
          .tier-badge {
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            color: white;
            text-transform: uppercase;
          }

          .status-badge {
            background: #28a745;
          }

          .email {
            color: #666;
            font-size: 0.875rem;
          }

          .failure-count {
            color: #dc3545;
            font-weight: 600;
          }

          .run-details {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 6px;
          }

          .run-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.75rem;
            font-size: 0.875rem;
            font-weight: 600;
          }

          .timestamp {
            color: #666;
          }

          .failures-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .failure-item {
            display: flex;
            gap: 0.75rem;
            align-items: center;
            font-size: 0.875rem;
          }

          .severity {
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            color: white;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
          }

          .check {
            color: #666;
            text-transform: uppercase;
            font-weight: 600;
          }

          .reason {
            color: #333;
          }

          .runs-table {
            overflow-x: auto;
          }

          table {
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          thead {
            background: #f8f9fa;
          }

          th {
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            color: #333;
            font-size: 0.875rem;
          }

          td {
            padding: 1rem;
            border-top: 1px solid #eee;
            font-size: 0.875rem;
          }

          .badge {
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            color: white;
            font-size: 0.75rem;
            font-weight: 600;
          }

          .alert {
            padding: 1.5rem;
            border-radius: 8px;
            margin: 1rem 0;
          }

          .alert-error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
          }

          .alert strong {
            display: block;
            margin-bottom: 0.5rem;
          }
        `}</style>
      </main>
    </Guard>
  );
}
