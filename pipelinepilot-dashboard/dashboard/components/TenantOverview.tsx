import { Tenant } from '../lib/hooks/useTenantData';

interface Props {
  tenant: Tenant | null;
}

/**
 * Tenant Overview Panel
 *
 * Displays:
 * - Tenant ID
 * - Status (active/trial/inactive/canceled)
 * - Beta Tier (internal/customer)
 * - Company name
 * - Created date
 */
export default function TenantOverview({ tenant }: Props) {
  if (!tenant) {
    return (
      <div className="panel">
        <h2>Tenant Overview</h2>
        <p className="loading">Loading...</p>

        <style jsx>{`
          .panel {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .loading {
            color: #999;
            font-style: italic;
          }
        `}</style>
      </div>
    );
  }

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#28a745';
      case 'trial':
        return '#17a2b8';
      case 'inactive':
        return '#6c757d';
      case 'canceled':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  // Beta tier badge color
  const getBetaTierColor = (betaTier?: string) => {
    if (betaTier === 'internal') return '#ffc107';
    if (betaTier === 'customer') return '#17a2b8';
    return '#6c757d';
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    try {
      // Firestore Timestamp
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }
      // ISO string
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="panel">
      <h2>Tenant Overview</h2>

      <div className="info-grid">
        <div className="info-row">
          <span className="label">Tenant ID:</span>
          <span className="value mono">{tenant.tenant_id}</span>
        </div>

        <div className="info-row">
          <span className="label">Status:</span>
          <span
            className="badge"
            style={{ backgroundColor: getStatusColor(tenant.status) }}
          >
            {tenant.status.toUpperCase()}
          </span>
        </div>

        {tenant.betaTier && (
          <div className="info-row">
            <span className="label">Beta Tier:</span>
            <span
              className="badge"
              style={{ backgroundColor: getBetaTierColor(tenant.betaTier) }}
            >
              {tenant.betaTier.toUpperCase()}
            </span>
          </div>
        )}

        {tenant.company_name && (
          <div className="info-row">
            <span className="label">Company:</span>
            <span className="value">{tenant.company_name}</span>
          </div>
        )}

        <div className="info-row">
          <span className="label">Email:</span>
          <span className="value">{tenant.email}</span>
        </div>

        <div className="info-row">
          <span className="label">Created:</span>
          <span className="value">{formatDate(tenant.created_at)}</span>
        </div>
      </div>

      <style jsx>{`
        .panel {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        h2 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.25rem;
          color: #333;
        }

        .info-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #eee;
        }

        .info-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .label {
          font-weight: 600;
          color: #666;
          font-size: 0.875rem;
        }

        .value {
          color: #333;
          font-size: 0.875rem;
        }

        .mono {
          font-family: 'Courier New', monospace;
          font-size: 0.8rem;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
