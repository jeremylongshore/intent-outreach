import { ArvResult, ArvFailure } from '../lib/hooks/useTenantData';

interface Props {
  arvResult: ArvResult | null;
  tenantId: string;
  betaTier: 'internal' | 'customer';
}

/**
 * Last ARV Result Panel
 *
 * Displays latest ARV run results for this tenant:
 * - Timestamp
 * - Pass/Warn/Fail status
 * - List of failures for this tenant
 *
 * Beta tier behavior:
 * - internal: critical failures shown as yellow warning
 * - customer: critical failures shown as red blocking error
 */
export default function LastArvResult({ arvResult, tenantId, betaTier }: Props) {
  if (!arvResult) {
    return (
      <div className="panel">
        <h2>System Checks (ARV)</h2>
        <p className="no-data">No ARV results available yet.</p>

        <style jsx>{`
          .panel {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .no-data {
            color: #999;
            font-style: italic;
          }
        `}</style>
      </div>
    );
  }

  // Get overall status
  const hasFailures = arvResult.failures && arvResult.failures.length > 0;
  const hasCritical = arvResult.failures.some((f) => f.severity === 'critical');

  // Format timestamp
  const formatTimestamp = (timestamp: string | any) => {
    try {
      // Firestore Timestamp
      if (timestamp?.toDate) {
        return timestamp.toDate().toLocaleString();
      }
      // ISO string
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  // Get status badge
  const getStatusBadge = () => {
    if (!hasFailures) {
      return { text: 'PASSED', color: '#28a745' };
    }
    if (hasCritical) {
      return { text: 'CRITICAL', color: '#dc3545' };
    }
    return { text: 'WARNING', color: '#ffc107' };
  };

  const status = getStatusBadge();

  // Blocking behavior
  const isBlocking = hasCritical && betaTier === 'customer';
  const isWarning = hasCritical && betaTier === 'internal';

  return (
    <div className="panel">
      <h2>System Checks (ARV)</h2>

      {/* Beta tier warnings */}
      {isBlocking && (
        <div className="alert alert-error">
          <strong>🚨 Action Required</strong>
          <p>
            Critical issues detected with your workspace. Please fix the issues below
            to use PipelinePilot.
          </p>
        </div>
      )}

      {isWarning && (
        <div className="alert alert-warning">
          <strong>⚠️ Internal Beta</strong>
          <p>
            Critical issues detected, but your workspace is marked as internal beta.
            This won't block your access.
          </p>
        </div>
      )}

      {/* Status summary */}
      <div className="status-row">
        <div className="status-item">
          <span className="label">Last Check:</span>
          <span className="value">{formatTimestamp(arvResult.finishedAt)}</span>
        </div>

        <div className="status-item">
          <span className="label">Status:</span>
          <span className="badge" style={{ backgroundColor: status.color }}>
            {status.text}
          </span>
        </div>

        <div className="status-item">
          <span className="label">Duration:</span>
          <span className="value">{arvResult.durationMs}ms</span>
        </div>
      </div>

      {/* Failures list */}
      {hasFailures && (
        <div className="failures-section">
          <h3>Issues Found:</h3>
          <div className="failures-list">
            {arvResult.failures.map((failure, index) => (
              <div key={index} className="failure-item">
                <div className="failure-header">
                  <span
                    className="severity-badge"
                    style={{
                      backgroundColor:
                        failure.severity === 'critical' ? '#dc3545' : '#ffc107',
                    }}
                  >
                    {failure.severity.toUpperCase()}
                  </span>
                  <span className="check-type">{failure.check}</span>
                </div>

                <p className="failure-reason">{failure.reason}</p>

                {failure.details && (
                  <div className="failure-details">
                    <code>{JSON.stringify(failure.details, null, 2)}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="actions">
        <button className="btn-secondary" onClick={() => window.location.reload()}>
          Refresh Status
        </button>
        {hasFailures && (
          <a href="/settings/keys" className="btn-primary">
            Configure API Keys
          </a>
        )}
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

        h3 {
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          font-size: 1rem;
          color: #333;
        }

        .alert {
          padding: 0.75rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .alert strong {
          display: block;
          margin-bottom: 0.25rem;
        }

        .alert p {
          margin: 0;
          line-height: 1.4;
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

        .status-row {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        .status-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
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

        .badge,
        .severity-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .failures-section {
          margin-top: 1.5rem;
        }

        .failures-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .failure-item {
          padding: 0.75rem;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 6px;
        }

        .failure-header {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .check-type {
          font-weight: 600;
          color: #333;
          font-size: 0.875rem;
          text-transform: uppercase;
        }

        .failure-reason {
          margin: 0.5rem 0;
          color: #666;
          font-size: 0.875rem;
        }

        .failure-details {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .failure-details code {
          font-family: 'Courier New', monospace;
          font-size: 0.75rem;
          color: #333;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #eee;
        }

        .btn-primary,
        .btn-secondary {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }

        .btn-primary {
          background: #007bff;
          color: white;
        }

        .btn-primary:hover {
          background: #0056b3;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover {
          background: #545b62;
        }
      `}</style>
    </div>
  );
}
