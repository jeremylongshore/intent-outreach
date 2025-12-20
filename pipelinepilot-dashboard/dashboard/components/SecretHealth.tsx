import { SecretHealth as SecretHealthType } from '../lib/hooks/useTenantData';

interface Props {
  secrets: SecretHealthType[] | null;
  betaTier: 'internal' | 'customer';
}

/**
 * Secret Health Panel
 *
 * Displays status of all 4 required API keys:
 * - CLAY
 * - APOLLO
 * - CLEARBIT
 * - CRUNCHBASE
 *
 * Beta tier behavior:
 * - internal: warnings as yellow, no blocking
 * - customer: missing secrets as red, "Action required" message
 */
export default function SecretHealth({ secrets, betaTier }: Props) {
  if (!secrets) {
    return (
      <div className="panel">
        <h2>Secret Health</h2>
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

  // Get badge color based on status and beta tier
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ok':
        return '#28a745'; // Green
      case 'placeholder':
        // Internal: yellow (warning)
        // Customer: red (critical)
        return betaTier === 'internal' ? '#ffc107' : '#dc3545';
      case 'missing':
        // Internal: yellow (warning)
        // Customer: red (critical)
        return betaTier === 'internal' ? '#ffc107' : '#dc3545';
      case 'error':
        return '#dc3545'; // Red
      default:
        return '#6c757d'; // Gray
    }
  };

  // Get status text
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'ok':
        return 'OK';
      case 'placeholder':
        return 'PLACEHOLDER';
      case 'missing':
        return 'MISSING';
      case 'error':
        return 'ERROR';
      default:
        return 'UNKNOWN';
    }
  };

  // Check if any secrets need action
  const needsAction = secrets.some(
    (s) => s.status === 'missing' || s.status === 'placeholder'
  );

  const isBlocking = betaTier === 'customer' && needsAction;

  return (
    <div className="panel">
      <h2>Secret Health</h2>

      {/* Beta tier warning for internal users */}
      {betaTier === 'internal' && needsAction && (
        <div className="alert alert-warning">
          <strong>⚠️ Internal Beta</strong>
          <p>Some secrets are missing or placeholders. This won't block your access.</p>
        </div>
      )}

      {/* Blocking message for customer users */}
      {isBlocking && (
        <div className="alert alert-error">
          <strong>🚨 Action Required</strong>
          <p>
            Some API keys are missing. Please configure them to use PipelinePilot.
          </p>
          <a href="/settings/keys" className="action-link">
            Configure API Keys →
          </a>
        </div>
      )}

      <div className="secret-grid">
        {secrets.map((secret) => (
          <div key={secret.provider} className="secret-row">
            <span className="provider-name">{secret.provider}</span>
            <span
              className="status-badge"
              style={{ backgroundColor: getStatusColor(secret.status) }}
            >
              {getStatusText(secret.status)}
            </span>
          </div>
        ))}
      </div>

      {needsAction && (
        <div className="help-section">
          <p className="help-text">
            <strong>How to fix:</strong>{' '}
            <a
              href="https://docs.pipelinepilot.io/setup/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="help-link"
            >
              API Key Setup Guide →
            </a>
          </p>
        </div>
      )}

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

        .action-link {
          display: inline-block;
          margin-top: 0.5rem;
          color: #721c24;
          font-weight: 600;
          text-decoration: underline;
        }

        .action-link:hover {
          color: #491217;
        }

        .secret-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .secret-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .provider-name {
          font-weight: 600;
          color: #333;
          font-size: 0.875rem;
        }

        .status-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .help-section {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #eee;
        }

        .help-text {
          font-size: 0.875rem;
          color: #666;
          margin: 0;
        }

        .help-link {
          color: #007bff;
          text-decoration: none;
        }

        .help-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
