import * as request from 'supertest';

describe('E2E: README flow', () => {
  jest.setTimeout(120000);

  let subApi: ReturnType<typeof request>;
  let payApi: ReturnType<typeof request>;
  let email: string;
  let password: string;
  let token: string | null = null;
  let authHeader: Readonly<Record<string, string>> | null = null;
  let planId: string | null = null;
  let subscriptionId: string | null = null;
  let finalStatus: string | null = null;

  beforeAll((): void => {
    subApi = request('http://localhost:3000');
    payApi = request('http://localhost:3001');
  });

  it('registers a user', async (): Promise<void> => {
    email = `user+${Date.now()}@example.com`;
    password = 'Password123!';
    const reg = await subApi.post('/auth/register').send({ email, password });
    expect([200, 201, 409]).toContain(reg.status);
  });

  it('logs in and stores JWT', async (): Promise<void> => {
    const login = await subApi.post('/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const loginBody: unknown = login.body;
    const extracted: string | null = ((): string | null => {
      if (typeof loginBody === 'object' && loginBody !== null) {
        const maybe = loginBody as Record<string, unknown>;
        const value = maybe.access_token;
        return typeof value === 'string' ? value : null;
      }
      return null;
    })();
    if (extracted === null)
      throw new Error('Missing access_token in login response');
    token = extracted;
    authHeader = { Authorization: `Bearer ${token}` } as const;
  });

  it('creates a plan', async (): Promise<void> => {
    if (authHeader === null) throw new Error('authHeader not set');
    const plan = await subApi
      .post('/plans')
      .set(authHeader)
      .send({
        name: `Pro-${Date.now()}`,
        price: 29.99,
        billingCycle: 'MONTHLY',
        features: ['f1'],
      });
    if (![200, 201].includes(plan.status)) {
      // eslint-disable-next-line no-console
      console.error('Plan creation unexpected response:', {
        status: plan.status,
        body: plan.body,
      });
    }
    expect([200, 201]).toContain(plan.status);

    const planBody: unknown = plan.body;
    const extractedPlanId: string | null = ((): string | null => {
      if (typeof planBody === 'object' && planBody !== null) {
        const obj = planBody as Record<string, unknown>;
        const value = obj.id;
        return typeof value === 'string' ? value : null;
      }
      return null;
    })();
    if (extractedPlanId === null)
      throw new Error('Missing id in plan response');
    planId = extractedPlanId;
  });

  it('creates a subscription', async (): Promise<void> => {
    if (authHeader === null) throw new Error('authHeader not set');
    if (planId === null) throw new Error('planId not set');
    let createdResponse: import('supertest').Response | null = null;
    let createdOk = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await subApi
        .post('/subscriptions')
        .set(authHeader)
        .send({ planId });
      if ([200, 201, 202].includes(response.status)) {
        createdResponse = response;
        createdOk = true;
        break;
      }
      // eslint-disable-next-line no-console
      console.error(`Subscription creation attempt ${attempt} failed:`, {
        status: response.status,
        body: response.body,
      });
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!createdOk || createdResponse === null) {
      throw new Error('Failed to create subscription after retries');
    }

    const createdBody: unknown = createdResponse.body;
    const extractedSubscriptionId: string | null = ((): string | null => {
      if (typeof createdBody === 'object' && createdBody !== null) {
        const obj = createdBody as Record<string, unknown>;
        const value = obj.id;
        return typeof value === 'string' ? value : null;
      }
      return null;
    })();
    if (extractedSubscriptionId === null)
      throw new Error('Missing id in subscription create response');
    subscriptionId = extractedSubscriptionId;
  });

  it('waits for subscription to reach a terminal status', async (): Promise<void> => {
    if (authHeader === null) throw new Error('authHeader not set');
    if (subscriptionId === null) throw new Error('subscriptionId not set');
    const deadline: number = Date.now() + 60_000;
    let statusValue = 'PENDING';
    while (Date.now() < deadline) {
      const s = await subApi
        .get(`/subscriptions/${subscriptionId}`)
        .set(authHeader);
      expect(s.status).toBe(200);
      const sBody: unknown = s.body;
      const status: string | null = ((): string | null => {
        if (typeof sBody === 'object' && sBody !== null) {
          const obj = sBody as Record<string, unknown>;
          const value = obj.status;
          return typeof value === 'string' ? value : null;
        }
        return null;
      })();
      if (status === null)
        throw new Error('Missing status in subscription response');
      statusValue = status;
      if (statusValue !== 'PENDING') break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    finalStatus = statusValue;
    expect(['ACTIVE', 'CANCELLED']).toContain(finalStatus);
  });

  it('lists payments and sees at least one', async (): Promise<void> => {
    const tx = await payApi.get('/payments');
    expect(tx.status).toBe(200);
    const listUnknown: unknown = tx.body;
    const count: number = Array.isArray(listUnknown) ? listUnknown.length : 0;
    expect(count).toBeGreaterThan(0);
  });
});
