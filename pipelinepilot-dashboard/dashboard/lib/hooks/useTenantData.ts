import { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';

/**
 * Tenant document structure (from Phase 1-2)
 */
export interface Tenant {
  tenant_id: string;
  status: 'active' | 'trial' | 'inactive' | 'canceled';
  betaTier?: 'internal' | 'customer';
  stripe_customer_id: string;
  email: string;
  company_name?: string;
  created_at: any;
  updated_at: any;
}

/**
 * Secret health structure (from Phase 3)
 */
export interface SecretHealth {
  provider: 'CLAY' | 'APOLLO' | 'CLEARBIT' | 'CRUNCHBASE';
  status: 'ok' | 'placeholder' | 'missing' | 'error';
  lastChecked?: string;
  errorMessage?: string;
}

/**
 * ARV failure structure (from Phase 4)
 */
export interface ArvFailure {
  tenantId: string;
  check: 'tenant' | 'secrets' | 'function' | 'vertex';
  severity: 'critical' | 'warning';
  reason: string;
  details?: Record<string, any>;
}

/**
 * ARV result structure (from Phase 4)
 */
export interface ArvResult {
  ok: boolean;
  critical: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tenantsChecked: number;
  tenantsPassed: number;
  tenantsFailed: number;
  tenantsWarning: number;
  failures: ArvFailure[];
  summary: {
    criticalFailures: number;
    warnings: number;
    checksPerformed: number;
  };
  timestamp?: any;
}

/**
 * Hook return type
 */
export interface TenantDataResult {
  tenant: Tenant | null;
  secrets: SecretHealth[] | null;
  arvResult: ArvResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * Custom hook to fetch tenant data, secrets, and ARV results
 *
 * Fetches from:
 * - /tenants/{tenantId}
 * - /tenants/{tenantId}/config/secrets
 * - /system/arv-runs/runs (latest run containing this tenantId)
 *
 * @param tenantId - Tenant ID from auth token
 * @returns Tenant data, secrets, ARV result, loading state, and errors
 */
export function useTenantData(tenantId: string | null): TenantDataResult {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [secrets, setSecrets] = useState<SecretHealth[] | null>(null);
  const [arvResult, setArvResult] = useState<ArvResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch tenant document
        const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));

        if (!tenantDoc.exists()) {
          throw new Error(`Tenant ${tenantId} not found`);
        }

        const tenantData = {
          tenant_id: tenantDoc.id,
          ...tenantDoc.data(),
        } as Tenant;

        setTenant(tenantData);

        // 2. Fetch secret health from /tenants/{tenantId}/config/secrets
        const secretsDoc = await getDoc(
          doc(db, 'tenants', tenantId, 'config', 'secrets')
        );

        if (secretsDoc.exists()) {
          const secretsData = secretsDoc.data();
          const providers: Array<'CLAY' | 'APOLLO' | 'CLEARBIT' | 'CRUNCHBASE'> = [
            'CLAY',
            'APOLLO',
            'CLEARBIT',
            'CRUNCHBASE',
          ];

          const secretHealthList: SecretHealth[] = providers.map((provider) => {
            const providerData = secretsData[provider];
            return {
              provider,
              status: providerData?.status || 'missing',
              lastChecked: providerData?.lastChecked || undefined,
              errorMessage: providerData?.errorMessage || undefined,
            };
          });

          setSecrets(secretHealthList);
        } else {
          // No secrets document yet - all missing
          setSecrets([
            { provider: 'CLAY', status: 'missing' },
            { provider: 'APOLLO', status: 'missing' },
            { provider: 'CLEARBIT', status: 'missing' },
            { provider: 'CRUNCHBASE', status: 'missing' },
          ]);
        }

        // 3. Fetch latest ARV run that contains this tenantId
        // Query /system/arv-runs/runs, ordered by timestamp desc, limit 50
        // Then filter client-side for failures containing this tenantId
        const arvQuery = query(
          collection(db, 'system', 'arv-runs', 'runs'),
          orderBy('timestamp', 'desc'),
          limit(50)
        );

        const arvSnapshot = await getDocs(arvQuery);

        // Find the most recent run that has failures for this tenant
        let latestArvForTenant: ArvResult | null = null;

        for (const arvDoc of arvSnapshot.docs) {
          const arvData = arvDoc.data() as ArvResult;

          // Check if this ARV run has failures for our tenant
          const tenantFailures = arvData.failures?.filter(
            (f) => f.tenantId === tenantId
          ) || [];

          if (tenantFailures.length > 0 || arvData.tenantsChecked > 0) {
            // Found a run that includes this tenant
            latestArvForTenant = {
              ...arvData,
              // Filter failures to only this tenant
              failures: tenantFailures,
            };
            break;
          }
        }

        setArvResult(latestArvForTenant);
      } catch (err) {
        console.error('Error fetching tenant data:', err);
        setError((err as Error).message || 'Failed to load tenant data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId]);

  return {
    tenant,
    secrets,
    arvResult,
    loading,
    error,
  };
}
