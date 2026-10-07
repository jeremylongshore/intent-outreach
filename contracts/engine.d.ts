/**
 * GENERATED from intent-outreach Zod output schemas. Do not edit.
 * Regenerate: pnpm run contracts:generate
 * Static types do not enforce refinements, formats, retention, approvals or send eligibility.
 * Validate external JSON through the canonical engine before use.
 */

export type ResearchQuery =
  | {
      kind: "domain";
      domain: string;
    }
  | {
      kind: "area";
      geography: {
        state?: string;
        countyFips?: string[];
        zips?: string[];
      };
      filters: {
        [k: string]: unknown;
      };
    }
  | {
      kind: "parcel";
      countyFips?: string;
      apn?: string;
      address?: {
        line1: string;
        line2?: string;
        city: string;
        state: string;
        zip: string;
        county?: string;
        countyFips?: string;
      };
    };
export type Channel = "email" | "linkedin" | "sms" | "mail" | "call_script";
export type DncStatus = "clean" | "listed" | "unknown";

/**
 * Structural output contracts only; canonical Zod refinements remain authoritative.
 */
export interface EngineContracts {
  Lead: Lead;
  Contact: Contact;
  Enrichment: Enrichment;
  Message: Message;
  CampaignRun: CampaignRun;
  Property: Property;
  Party: Party;
  Ownership: Ownership;
  EntityLink: EntityLink;
  ContactPoint: ContactPoint;
  ResearchQuery: ResearchQuery;
  Address: Address;
  Channel: Channel;
  DncStatus: DncStatus;
  LicenseTerms: LicenseTerms;
  ConsentRecord: ConsentRecord;
}
export interface Lead {
  domain: string;
  companyName: string;
  industry?: string;
  size?: string;
  description?: string;
  source: string;
}
export interface Contact {
  name: string;
  leadDomain: string;
  email?: string;
  title?: string;
  linkedin?: string;
  source: string;
  nameIncomplete?: boolean;
}
export interface Enrichment {
  subjectType: "lead" | "contact";
  subjectKey: string;
  provider: string;
  funding?: {
    lastRound?: string;
    totalRaisedUsd?: number;
    lastRoundDate?: string;
    investors?: string[];
  };
  verifiedEmail?: string;
  contactName?: string;
  phone?: string;
  data: {
    [k: string]: unknown;
  };
  fetchedAt: string;
}
export interface Message {
  contactKey: string;
  channel: "email" | "linkedin" | "sms" | "mail" | "call_script";
  subject?: string;
  body: string;
  cta: string;
  fitScore?: number;
  model: string;
  promptVersion: string;
  createdAt: string;
  needsSenderIdentity: boolean;
  propertyKey?: string;
}
export interface CampaignRun {
  id: string;
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6;
  icp: string;
  domains: string[];
  vertical: string;
  provider: string;
  model: string;
  status: ("researched" | "enriched" | "complete" | "partial" | "failed") | ("pending" | "drafted");
  leads: {
    domain: string;
    companyName: string;
    industry?: string;
    size?: string;
    description?: string;
    source: string;
  }[];
  contacts: {
    name: string;
    leadDomain: string;
    email?: string;
    title?: string;
    linkedin?: string;
    source: string;
    nameIncomplete?: boolean;
  }[];
  enrichments: {
    subjectType: "lead" | "contact";
    subjectKey: string;
    provider: string;
    funding?: {
      lastRound?: string;
      totalRaisedUsd?: number;
      lastRoundDate?: string;
      investors?: string[];
    };
    verifiedEmail?: string;
    contactName?: string;
    phone?: string;
    data: {
      [k: string]: unknown;
    };
    fetchedAt: string;
  }[];
  messages: {
    contactKey: string;
    channel: "email" | "linkedin" | "sms" | "mail" | "call_script";
    subject?: string;
    body: string;
    cta: string;
    fitScore?: number;
    model: string;
    promptVersion: string;
    createdAt: string;
    needsSenderIdentity: boolean;
    propertyKey?: string;
  }[];
  costUsd?: number;
  skippedConnectors: string[];
  blockedContacts: {
    contactKey: string;
    reason: string;
    propertyKey?: string;
  }[];
  errors: {
    domain?: string;
    propertyKey?: string;
    contactKey?: string;
    stage: "score" | "gate" | "draft";
    message: string;
    finishReason?: string;
  }[];
  rejectedDrafts: {
    contactKey: string;
    issues: string[];
    propertyKey?: string;
  }[];
  failedConnectors: {
    name: string;
    phase: "research" | "enrich";
    status: number | string;
  }[];
  complianceWarnings: string[];
  promptRefs: {
    score?: string[];
    draft?: string;
  };
  droppedAngles: {
    domain?: string;
    propertyKey?: string;
    angle: string;
    reason: string;
  }[];
  origin?: "pipeline" | "agent";
  queries?: (
    | {
        kind: "domain";
        domain: string;
      }
    | {
        kind: "area";
        geography: {
          state?: string;
          countyFips?: string[];
          zips?: string[];
        };
        filters: {
          [k: string]: unknown;
        };
      }
    | {
        kind: "parcel";
        countyFips?: string;
        apn?: string;
        address?: {
          line1: string;
          line2?: string;
          city: string;
          state: string;
          zip: string;
          county?: string;
          countyFips?: string;
        };
      }
  )[];
  seamModels?: {
    score: {
      provider: string;
      model: string;
    };
    draft: {
      provider: string;
      model: string;
    };
  };
  inbound?: {
    source: string;
    receivedAt: string;
    draftedAt: string;
    speedToLeadMs: number;
  };
  credits?: {
    limit: number;
    spent: number;
    exhausted: boolean;
    byConnector: {
      [k: string]: number;
    };
  };
  properties: {
    key: string;
    apn: string;
    countyFips: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      zip: string;
      county?: string;
      countyFips?: string;
    };
    location?: {
      lat: number;
      lon: number;
    };
    attributes: {
      [k: string]: {
        value: unknown;
        source: string;
        fetchedAt: string;
        responseHash?: string;
        licenseTerms?: {
          id?: string;
          outreachRestricted?: boolean;
          retentionDays?: number;
          attribution?: string;
        };
        via?: {
          server: string;
          version: string;
          tool: string;
        };
      };
    };
    source: string;
  }[];
  parties: {
    key: string;
    kind: "person" | "entity";
    name: string;
    entityType?: "llc" | "corporation" | "trust" | "estate" | "partnership" | "government" | "other";
    mailingAddress?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      zip: string;
      county?: string;
      countyFips?: string;
    };
    source: string;
    licenseTerms?: {
      id?: string;
      outreachRestricted?: boolean;
      retentionDays?: number;
      attribution?: string;
    };
  }[];
  ownerships: {
    propertyKey: string;
    partyKey: string;
    share?: number;
    role: "owner" | "co-owner" | "trustee" | "life-tenant";
    asOf?: string;
    source: string;
    fetchedAt: string;
  }[];
  entityLinks: {
    entityKey: string;
    personKey: string;
    role: "member" | "manager" | "officer" | "registered-agent" | "organizer" | "other";
    confidence: number;
    source: string;
    fetchedAt: string;
  }[];
  contactPoints: {
    partyKey: string;
    kind: "phone" | "email" | "mail";
    value: string;
    lineType?: "mobile" | "landline" | "voip" | "unknown";
    dnc: "clean" | "listed" | "unknown";
    source: string;
    fetchedAt: string;
    verifiedAt?: string;
    licenseTerms?: {
      id?: string;
      outreachRestricted?: boolean;
      retentionDays?: number;
      attribution?: string;
    };
  }[];
  createdAt: string;
  finishedAt?: string;
}
export interface Property {
  key: string;
  apn: string;
  countyFips: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
    countyFips?: string;
  };
  location?: {
    lat: number;
    lon: number;
  };
  attributes: {
    [k: string]: {
      value: unknown;
      source: string;
      fetchedAt: string;
      responseHash?: string;
      licenseTerms?: {
        id?: string;
        outreachRestricted?: boolean;
        retentionDays?: number;
        attribution?: string;
      };
      via?: {
        server: string;
        version: string;
        tool: string;
      };
    };
  };
  source: string;
}
export interface Party {
  key: string;
  kind: "person" | "entity";
  name: string;
  entityType?: "llc" | "corporation" | "trust" | "estate" | "partnership" | "government" | "other";
  mailingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
    countyFips?: string;
  };
  source: string;
  licenseTerms?: {
    id?: string;
    outreachRestricted?: boolean;
    retentionDays?: number;
    attribution?: string;
  };
}
export interface Ownership {
  propertyKey: string;
  partyKey: string;
  share?: number;
  role: "owner" | "co-owner" | "trustee" | "life-tenant";
  asOf?: string;
  source: string;
  fetchedAt: string;
}
export interface EntityLink {
  entityKey: string;
  personKey: string;
  role: "member" | "manager" | "officer" | "registered-agent" | "organizer" | "other";
  confidence: number;
  source: string;
  fetchedAt: string;
}
export interface ContactPoint {
  partyKey: string;
  kind: "phone" | "email" | "mail";
  value: string;
  lineType?: "mobile" | "landline" | "voip" | "unknown";
  dnc: "clean" | "listed" | "unknown";
  source: string;
  fetchedAt: string;
  verifiedAt?: string;
  licenseTerms?: {
    id?: string;
    outreachRestricted?: boolean;
    retentionDays?: number;
    attribution?: string;
  };
}
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  countyFips?: string;
}
export interface LicenseTerms {
  id?: string;
  outreachRestricted?: boolean;
  retentionDays?: number;
  attribution?: string;
}
export interface ConsentRecord {
  id: string;
  contact: {
    kind: "phone" | "email" | "mail";
    value: string;
  };
  /**
   * @minItems 1
   */
  scope: ("email" | "linkedin" | "sms" | "mail" | "call_script")[];
  method: "web_form" | "signed_form" | "verbal_documented" | "in_person" | "sphere_import";
  recordedAt: string;
  textShown: string;
  textVersion: string;
  sourceUrl?: string;
  remoteAddress?: string;
  userAgent?: string;
  revokedAt?: string;
  revocationMethod?: string;
}
