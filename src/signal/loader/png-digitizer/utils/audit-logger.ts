/**
 * Audit Logger
 * Immutable audit trail for medical software compliance
 *
 * Required for:
 * - FDA 21 CFR Part 11 compliance
 * - HIPAA audit requirements
 * - Quality assurance tracking
 * - Chain of custody documentation
 *
 * Features:
 * - Immutable event log
 * - Cryptographic integrity (hash chain)
 * - User/session tracking
 * - Event timestamps with timezone
 * - Export to various formats
 *
 * @module signal/loader/png-digitizer/utils/audit-logger
 */

/**
 * Audit event types
 */
export type AuditEventType =
  | 'ecg_loaded'
  | 'ecg_digitized'
  | 'ecg_analyzed'
  | 'ecg_corrected'
  | 'ecg_exported'
  | 'ecg_verified'
  | 'ecg_rejected'
  | 'user_login'
  | 'user_logout'
  | 'settings_changed'
  | 'error_occurred'
  | 'phi_accessed'
  | 'phi_redacted'
  | 'report_generated'
  | 'report_signed'
  | 'comparison_performed'
  | 'critical_finding_detected';

/**
 * Audit severity levels
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Single audit event
 */
export interface AuditEvent {
  /** Unique event ID */
  eventId: string;

  /** Event type */
  type: AuditEventType;

  /** Severity level */
  severity: AuditSeverity;

  /** Timestamp (ISO 8601) */
  timestamp: string;

  /** Timezone offset */
  timezoneOffset: number;

  /** User ID (if authenticated) */
  userId?: string;

  /** Session ID */
  sessionId: string;

  /** Description */
  description: string;

  /** Related entity ID (ECG ID, report ID, etc.) */
  entityId?: string;

  /** Entity type */
  entityType?: 'ecg' | 'report' | 'patient' | 'user' | 'system';

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Previous event hash (for chain integrity) */
  previousHash?: string;

  /** This event's hash */
  hash: string;
}

/**
 * Audit log export format
 */
export type AuditExportFormat = 'json' | 'csv' | 'xml' | 'hl7';

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  /** Filter by event type */
  types?: AuditEventType[];

  /** Filter by severity */
  severities?: AuditSeverity[];

  /** Filter by user */
  userId?: string;

  /** Filter by entity */
  entityId?: string;

  /** Start date */
  startDate?: Date;

  /** End date */
  endDate?: Date;

  /** Maximum results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Audit statistics
 */
export interface AuditStatistics {
  /** Total events */
  totalEvents: number;

  /** Events by type */
  eventsByType: Partial<Record<AuditEventType, number>>;

  /** Events by severity */
  eventsBySeverity: Partial<Record<AuditSeverity, number>>;

  /** Events by user */
  eventsByUser: Record<string, number>;

  /** First event timestamp */
  firstEvent?: string;

  /** Last event timestamp */
  lastEvent?: string;

  /** Chain integrity valid */
  chainIntegrityValid: boolean;
}

/**
 * Storage backend interface
 */
export interface AuditStorage {
  /** Append event to storage */
  append(event: AuditEvent): Promise<void>;

  /** Query events */
  query(options: AuditQueryOptions): Promise<AuditEvent[]>;

  /** Get event by ID */
  getById(eventId: string): Promise<AuditEvent | null>;

  /** Get last event (for hash chain) */
  getLastEvent(): Promise<AuditEvent | null>;

  /** Get all events */
  getAll(): Promise<AuditEvent[]>;

  /** Clear storage (for testing only) */
  clear(): Promise<void>;
}

/**
 * In-memory storage implementation
 */
export class InMemoryAuditStorage implements AuditStorage {
  private events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async query(options: AuditQueryOptions): Promise<AuditEvent[]> {
    let results = [...this.events];

    if (options.types && options.types.length > 0) {
      results = results.filter(e => options.types!.includes(e.type));
    }

    if (options.severities && options.severities.length > 0) {
      results = results.filter(e => options.severities!.includes(e.severity));
    }

    if (options.userId) {
      results = results.filter(e => e.userId === options.userId);
    }

    if (options.entityId) {
      results = results.filter(e => e.entityId === options.entityId);
    }

    if (options.startDate) {
      results = results.filter(e => new Date(e.timestamp) >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter(e => new Date(e.timestamp) <= options.endDate!);
    }

    if (options.offset) {
      results = results.slice(options.offset);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getById(eventId: string): Promise<AuditEvent | null> {
    return this.events.find(e => e.eventId === eventId) || null;
  }

  async getLastEvent(): Promise<AuditEvent | null> {
    return this.events.length > 0 ? this.events[this.events.length - 1] : null;
  }

  async getAll(): Promise<AuditEvent[]> {
    return [...this.events];
  }

  async clear(): Promise<void> {
    this.events = [];
  }
}

/**
 * LocalStorage-based storage implementation (browser)
 */
export class LocalStorageAuditStorage implements AuditStorage {
  private readonly key = 'peds_ecg_audit_log';

  private getEvents(): AuditEvent[] {
    if (typeof localStorage === 'undefined') return [];
    const data = localStorage.getItem(this.key);
    return data ? JSON.parse(data) : [];
  }

  private setEvents(events: AuditEvent[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.key, JSON.stringify(events));
  }

  async append(event: AuditEvent): Promise<void> {
    const events = this.getEvents();
    events.push(event);
    this.setEvents(events);
  }

  async query(options: AuditQueryOptions): Promise<AuditEvent[]> {
    let results = this.getEvents();

    if (options.types && options.types.length > 0) {
      results = results.filter(e => options.types!.includes(e.type));
    }

    if (options.severities && options.severities.length > 0) {
      results = results.filter(e => options.severities!.includes(e.severity));
    }

    if (options.userId) {
      results = results.filter(e => e.userId === options.userId);
    }

    if (options.entityId) {
      results = results.filter(e => e.entityId === options.entityId);
    }

    if (options.startDate) {
      results = results.filter(e => new Date(e.timestamp) >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter(e => new Date(e.timestamp) <= options.endDate!);
    }

    if (options.offset) {
      results = results.slice(options.offset);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getById(eventId: string): Promise<AuditEvent | null> {
    return this.getEvents().find(e => e.eventId === eventId) || null;
  }

  async getLastEvent(): Promise<AuditEvent | null> {
    const events = this.getEvents();
    return events.length > 0 ? events[events.length - 1] : null;
  }

  async getAll(): Promise<AuditEvent[]> {
    return this.getEvents();
  }

  async clear(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.key);
    }
  }
}

/**
 * Audit Logger configuration
 */
export interface AuditLoggerConfig {
  /** Storage backend */
  storage?: AuditStorage;

  /** Current user ID */
  userId?: string;

  /** Session ID (auto-generated if not provided) */
  sessionId?: string;

  /** Enable hash chain integrity */
  enableHashChain?: boolean;

  /** Callback for critical events */
  onCriticalEvent?: (event: AuditEvent) => void;
}

/**
 * Audit Logger class
 */
export class AuditLogger {
  private storage: AuditStorage;
  private userId?: string;
  private sessionId: string;
  private enableHashChain: boolean;
  private onCriticalEvent?: (event: AuditEvent) => void;

  constructor(config: AuditLoggerConfig = {}) {
    this.storage = config.storage || new InMemoryAuditStorage();
    this.userId = config.userId;
    this.sessionId = config.sessionId || this.generateSessionId();
    this.enableHashChain = config.enableHashChain ?? true;
    this.onCriticalEvent = config.onCriticalEvent;
  }

  /**
   * Log an audit event
   */
  async log(
    type: AuditEventType,
    description: string,
    options: {
      severity?: AuditSeverity;
      entityId?: string;
      entityType?: AuditEvent['entityType'];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AuditEvent> {
    const severity = options.severity || this.getDefaultSeverity(type);

    // Get previous hash for chain
    let previousHash: string | undefined;
    if (this.enableHashChain) {
      const lastEvent = await this.storage.getLastEvent();
      previousHash = lastEvent?.hash;
    }

    const event: AuditEvent = {
      eventId: this.generateEventId(),
      type,
      severity,
      timestamp: new Date().toISOString(),
      timezoneOffset: new Date().getTimezoneOffset(),
      userId: this.userId,
      sessionId: this.sessionId,
      description,
      entityId: options.entityId,
      entityType: options.entityType,
      metadata: options.metadata,
      previousHash,
      hash: '', // Will be computed
    };

    // Compute hash
    event.hash = await this.computeHash(event);

    // Store event
    await this.storage.append(event);

    // Trigger callback for critical events
    if (severity === 'critical' && this.onCriticalEvent) {
      this.onCriticalEvent(event);
    }

    return event;
  }

  /**
   * Log ECG loaded
   */
  async logECGLoaded(ecgId: string, source: string, metadata?: Record<string, unknown>): Promise<AuditEvent> {
    return this.log('ecg_loaded', `ECG loaded from ${source}`, {
      entityId: ecgId,
      entityType: 'ecg',
      metadata: { source, ...metadata },
    });
  }

  /**
   * Log ECG digitized
   */
  async logECGDigitized(
    ecgId: string,
    options: {
      method: string;
      confidence: number;
      leadCount: number;
      duration: number;
    }
  ): Promise<AuditEvent> {
    return this.log('ecg_digitized', `ECG digitized using ${options.method}`, {
      entityId: ecgId,
      entityType: 'ecg',
      metadata: options,
    });
  }

  /**
   * Log critical finding
   */
  async logCriticalFinding(
    ecgId: string,
    finding: string,
    urgency: string
  ): Promise<AuditEvent> {
    return this.log('critical_finding_detected', `Critical finding: ${finding}`, {
      severity: 'critical',
      entityId: ecgId,
      entityType: 'ecg',
      metadata: { finding, urgency },
    });
  }

  /**
   * Log PHI access
   */
  async logPHIAccess(
    entityId: string,
    action: 'viewed' | 'exported' | 'redacted'
  ): Promise<AuditEvent> {
    return this.log(
      action === 'redacted' ? 'phi_redacted' : 'phi_accessed',
      `PHI ${action}`,
      {
        severity: 'info',
        entityId,
        entityType: 'patient',
        metadata: { action },
      }
    );
  }

  /**
   * Log error
   */
  async logError(
    error: string,
    entityId?: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditEvent> {
    return this.log('error_occurred', error, {
      severity: 'error',
      entityId,
      metadata,
    });
  }

  /**
   * Query audit events
   */
  async query(options: AuditQueryOptions): Promise<AuditEvent[]> {
    return this.storage.query(options);
  }

  /**
   * Get events for entity
   */
  async getEntityHistory(entityId: string): Promise<AuditEvent[]> {
    return this.storage.query({ entityId });
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<AuditStatistics> {
    const events = await this.storage.getAll();

    const stats: AuditStatistics = {
      totalEvents: events.length,
      eventsByType: {},
      eventsBySeverity: {},
      eventsByUser: {},
      chainIntegrityValid: true,
    };

    // Count by type, severity, user
    for (const event of events) {
      stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
      if (event.userId) {
        stats.eventsByUser[event.userId] = (stats.eventsByUser[event.userId] || 0) + 1;
      }
    }

    // First and last
    if (events.length > 0) {
      stats.firstEvent = events[0].timestamp;
      stats.lastEvent = events[events.length - 1].timestamp;
    }

    // Verify chain integrity
    if (this.enableHashChain) {
      stats.chainIntegrityValid = await this.verifyChainIntegrity();
    }

    return stats;
  }

  /**
   * Verify hash chain integrity
   */
  async verifyChainIntegrity(): Promise<boolean> {
    const events = await this.storage.getAll();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Verify hash
      const computedHash = await this.computeHash(event);
      if (computedHash !== event.hash) {
        return false;
      }

      // Verify chain link
      if (i > 0 && event.previousHash !== events[i - 1].hash) {
        return false;
      }
    }

    return true;
  }

  /**
   * Export audit log
   */
  async export(format: AuditExportFormat, options?: AuditQueryOptions): Promise<string> {
    const events = options ? await this.storage.query(options) : await this.storage.getAll();

    switch (format) {
      case 'json':
        return JSON.stringify(events, null, 2);

      case 'csv':
        return this.exportCSV(events);

      case 'xml':
        return this.exportXML(events);

      case 'hl7':
        return this.exportHL7(events);

      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  /**
   * Set current user
   */
  setUser(userId: string | undefined): void {
    this.userId = userId;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  // Private methods

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `ses_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultSeverity(type: AuditEventType): AuditSeverity {
    switch (type) {
      case 'critical_finding_detected':
        return 'critical';
      case 'error_occurred':
        return 'error';
      case 'ecg_rejected':
      case 'settings_changed':
        return 'warning';
      default:
        return 'info';
    }
  }

  private async computeHash(event: AuditEvent): Promise<string> {
    // Create a deterministic string representation
    const data = JSON.stringify({
      eventId: event.eventId,
      type: event.type,
      severity: event.severity,
      timestamp: event.timestamp,
      userId: event.userId,
      sessionId: event.sessionId,
      description: event.description,
      entityId: event.entityId,
      metadata: event.metadata,
      previousHash: event.previousHash,
    });

    // Use SubtleCrypto if available (browser), otherwise simple hash
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: simple string hash (not cryptographically secure)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private exportCSV(events: AuditEvent[]): string {
    const headers = [
      'Event ID',
      'Type',
      'Severity',
      'Timestamp',
      'User ID',
      'Session ID',
      'Description',
      'Entity ID',
      'Entity Type',
      'Hash',
    ];

    const rows = events.map(e => [
      e.eventId,
      e.type,
      e.severity,
      e.timestamp,
      e.userId || '',
      e.sessionId,
      `"${e.description.replace(/"/g, '""')}"`,
      e.entityId || '',
      e.entityType || '',
      e.hash,
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  private exportXML(events: AuditEvent[]): string {
    const escapeXml = (str: string) => str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const eventXml = events.map(e => `
    <AuditEvent>
      <EventId>${e.eventId}</EventId>
      <Type>${e.type}</Type>
      <Severity>${e.severity}</Severity>
      <Timestamp>${e.timestamp}</Timestamp>
      <UserId>${e.userId || ''}</UserId>
      <SessionId>${e.sessionId}</SessionId>
      <Description>${escapeXml(e.description)}</Description>
      <EntityId>${e.entityId || ''}</EntityId>
      <EntityType>${e.entityType || ''}</EntityType>
      <Hash>${e.hash}</Hash>
    </AuditEvent>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<AuditLog>
  <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
  <EventCount>${events.length}</EventCount>
  <Events>${eventXml}
  </Events>
</AuditLog>`;
  }

  private exportHL7(_events: AuditEvent[]): string {
    // HL7 ATNA format would go here
    // For now, return a simplified version
    return JSON.stringify({
      resourceType: 'AuditEvent',
      type: {
        system: 'http://dicom.nema.org/resources/ontology/DCM',
        code: '110110',
        display: 'Patient Record',
      },
      recorded: new Date().toISOString(),
      // Full HL7 ATNA implementation would be more complex
    }, null, 2);
  }
}

// Global logger instance
let globalLogger: AuditLogger | null = null;

/**
 * Get or create global audit logger
 */
export function getAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  if (!globalLogger) {
    globalLogger = new AuditLogger(config);
  }
  return globalLogger;
}

/**
 * Set global audit logger
 */
export function setAuditLogger(logger: AuditLogger): void {
  globalLogger = logger;
}

/**
 * Convenience function to log an event
 */
export async function logAuditEvent(
  type: AuditEventType,
  description: string,
  options?: {
    severity?: AuditSeverity;
    entityId?: string;
    entityType?: AuditEvent['entityType'];
    metadata?: Record<string, unknown>;
  }
): Promise<AuditEvent> {
  return getAuditLogger().log(type, description, options);
}
