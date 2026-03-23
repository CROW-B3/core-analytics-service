import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../index';

// ── Mock D1 ────────────────────────────────────────────────────────────
const createMockD1 = () => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      all: vi.fn(() => ({ results: [] })),
      first: vi.fn(() => null),
      run: vi.fn(() => ({ success: true })),
    })),
    all: vi.fn(() => ({ results: [] })),
    first: vi.fn(() => null),
    run: vi.fn(() => ({ success: true })),
  })),
  batch: vi.fn(() => []),
  exec: vi.fn(),
  dump: vi.fn(),
});

const createMockR2 = () => ({
  put: vi.fn(),
  get: vi.fn(() => null),
  delete: vi.fn(),
  list: vi.fn(() => ({ objects: [] })),
  head: vi.fn(() => null),
});

const mockEnv = {
  DB: createMockD1(),
  R2_BUCKET: createMockR2(),
  INTERNAL_GATEWAY_KEY: 'test-key',
  ENVIRONMENT: 'local',
};

describe('core-analytics-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.DB = createMockD1();
  });

  // ── Health Check ──────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 with ok status', async () => {
      const res = await app.request('/health', {}, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
    });
  });

  // ── Internal Key Auth ─────────────────────────────────────────────
  describe('X-Internal-Key middleware', () => {
    it('returns 401 when X-Internal-Key is missing', async () => {
      const res = await app.request(
        '/api/v1/analytics/overview?organizationId=org-1',
        {},
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 when X-Internal-Key is wrong', async () => {
      const res = await app.request(
        '/api/v1/analytics/overview?organizationId=org-1',
        {
          headers: { 'X-Internal-Key': 'wrong-key' },
        },
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it('returns 503 when INTERNAL_GATEWAY_KEY is not configured', async () => {
      const envWithoutKey = { ...mockEnv, INTERNAL_GATEWAY_KEY: undefined };
      const res = await app.request(
        '/api/v1/analytics/overview?organizationId=org-1',
        {
          headers: { 'X-Internal-Key': 'test-key' },
        },
        envWithoutKey
      );
      expect(res.status).toBe(503);
    });
  });

  // ── GET /api/v1/analytics/overview ────────────────────────────────
  describe('GET /api/v1/analytics/overview', () => {
    it('returns 403 when X-Organization-Id does not match', async () => {
      const res = await app.request(
        '/api/v1/analytics/overview?organizationId=org-1',
        {
          headers: {
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'different-org',
          },
        },
        mockEnv
      );
      expect(res.status).toBe(403);
    });

    it('returns overview data when authorized', async () => {
      const res = await app.request(
        '/api/v1/analytics/overview?organizationId=org-1',
        {
          headers: {
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'org-1',
          },
        },
        mockEnv
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('byType');
      expect(body).toHaveProperty('bySource');
    });
  });

  // ── POST /api/v1/analytics/events ─────────────────────────────────
  describe('POST /api/v1/analytics/events', () => {
    it('returns 401 without X-Organization-Id', async () => {
      const res = await app.request(
        '/api/v1/analytics/events',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': 'test-key',
          },
          body: JSON.stringify({
            eventType: 'page_view',
            source: 'web',
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it('creates an event when authorized', async () => {
      const res = await app.request(
        '/api/v1/analytics/events',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'org-1',
          },
          body: JSON.stringify({
            eventType: 'page_view',
            source: 'web',
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('created', true);
    });
  });

  // ── GET /api/v1/analytics/events (query-based) ────────────────────
  describe('GET /api/v1/analytics/events', () => {
    it('returns 403 when org id mismatch', async () => {
      const res = await app.request(
        '/api/v1/analytics/events?organizationId=org-1',
        {
          headers: {
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'different-org',
          },
        },
        mockEnv
      );
      expect(res.status).toBe(403);
    });

    it('returns events list when authorized', async () => {
      const res = await app.request(
        '/api/v1/analytics/events?organizationId=org-1',
        {
          headers: {
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'org-1',
          },
        },
        mockEnv
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('total');
    });
  });

  // ── GET /api/v1/analytics/events/organization/:orgId (path-based) ──
  describe('GET /api/v1/analytics/events/organization/:orgId', () => {
    it('returns 403 when org id mismatch', async () => {
      const res = await app.request(
        '/api/v1/analytics/events/organization/org-1',
        {
          headers: {
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'different-org',
          },
        },
        mockEnv
      );
      expect(res.status).toBe(403);
    });

    it('returns events for organization when authorized', async () => {
      const res = await app.request(
        '/api/v1/analytics/events/organization/org-1',
        {
          headers: {
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'org-1',
          },
        },
        mockEnv
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('total');
    });
  });

  // ── Bad request handling ──────────────────────────────────────────
  describe('Error handling', () => {
    it('returns 400 for malformed JSON body', async () => {
      const res = await app.request(
        '/api/v1/analytics/events',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': 'test-key',
            'X-Organization-Id': 'org-1',
          },
          body: '{invalid json',
        },
        mockEnv
      );
      expect(res.status).toBe(400);
    });
  });
});
