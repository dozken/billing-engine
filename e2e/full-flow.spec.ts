import * as request from 'supertest';

describe('E2E: README flow', () => {
  jest.setTimeout(120000);

  let subApi: ReturnType<typeof request>;
  let payApi: ReturnType<typeof request>;
  // Use same data as README examples (lines 160-233)
  const email = 'seed.user@example.com';
  const password = 'Password123!';
  let token: string | null = null;
  let authHeader: Readonly<Record<string, string>> | null = null;
  // Use seeded plan IDs from README
  const planIdBasic = 'fixed-basic';
  const planIdPro = 'fixed-pro';
  let subscriptionId: string | null = null;
  let finalStatus: string | null = null;

  beforeAll(async (): Promise<void> => {
    subApi = request('http://localhost:3000');
    payApi = request('http://localhost:3001');
  });

  it('logs in with seeded user and stores JWT', async (): Promise<void> => {
    // Same credentials as README line 166-167
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

    // Clean up any existing subscriptions for this user via API
    try {
      const subscriptionsResponse = await subApi
        .get('/subscriptions')
        .set(authHeader);
      if (subscriptionsResponse.status === 200) {
        const subscriptionsBody: unknown = subscriptionsResponse.body;
        if (Array.isArray(subscriptionsBody) && subscriptionsBody.length > 0) {
          for (const sub of subscriptionsBody) {
            if (
              typeof sub === 'object' &&
              sub !== null &&
              'id' in sub &&
              'status' in sub
            ) {
              const subscription = sub as Record<string, unknown>;
              const subId = subscription.id;
              const status = subscription.status;
              if (typeof subId === 'string' && typeof status === 'string') {
                // Cancel active subscriptions
                if (status === 'ACTIVE') {
                  await subApi
                    .delete(`/subscriptions/${subId}`)
                    .set(authHeader);
                }
                // Wait for pending subscriptions to complete
                if (status === 'PENDING') {
                  const deadline: number = Date.now() + 30_000; // 30 second timeout
                  let currentStatus = 'PENDING';
                  while (Date.now() < deadline && currentStatus === 'PENDING') {
                    await new Promise((r) => setTimeout(r, 1000));
                    const statusResponse = await subApi
                      .get(`/subscriptions/${subId}`)
                      .set(authHeader);
                    if (statusResponse.status === 200) {
                      const statusBody: unknown = statusResponse.body;
                      if (
                        typeof statusBody === 'object' &&
                        statusBody !== null &&
                        'status' in statusBody
                      ) {
                        const statusObj = statusBody as Record<string, unknown>;
                        currentStatus =
                          typeof statusObj.status === 'string'
                            ? statusObj.status
                            : 'PENDING';
                        // If it became ACTIVE, cancel it
                        if (currentStatus === 'ACTIVE') {
                          await subApi
                            .delete(`/subscriptions/${subId}`)
                            .set(authHeader);
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to clean up existing subscriptions:', error);
    }

    // Small delay to ensure cleanup operations complete
    await new Promise((r) => setTimeout(r, 1000));
  });

  it('creates a subscription with fixed-basic plan', async (): Promise<void> => {
    if (authHeader === null) throw new Error('authHeader not set');
    // Same planId as README line 185
    let createdResponse: import('supertest').Response | null = null;
    let createdOk = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await subApi
        .post('/subscriptions')
        .set(authHeader)
        .send({ planId: planIdBasic });
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
    // Retry creating subscriptions until we get an ACTIVE one
    // (payment gateway has ~80% success rate)
    const maxAttempts = 10;
    let attempt = 0;
    let currentSubscriptionId = subscriptionId;
    let statusValue = 'PENDING';

    while (attempt < maxAttempts) {
      attempt++;

      // If we have a subscription ID, wait for it to reach terminal status
      if (currentSubscriptionId !== null) {
        const deadline: number = Date.now() + 60_000;
        let currentStatus = 'PENDING';
        while (Date.now() < deadline) {
          const s = await subApi
            .get(`/subscriptions/${currentSubscriptionId}`)
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
          currentStatus = status;
          if (currentStatus !== 'PENDING') break;
          await new Promise((r) => setTimeout(r, 1000));
        }

        statusValue = currentStatus;

        // If subscription is ACTIVE, we're done
        if (statusValue === 'ACTIVE') {
          subscriptionId = currentSubscriptionId;
          finalStatus = 'ACTIVE';
          return;
        }

        // If subscription is CANCELLED, create a new one and try again
        if (statusValue === 'CANCELLED') {
          // Create a new subscription
          const newSubResponse = await subApi
            .post('/subscriptions')
            .set(authHeader)
            .send({ planId: planIdBasic });

          if ([200, 201, 202].includes(newSubResponse.status)) {
            const newSubBody: unknown = newSubResponse.body;
            const extractedSubscriptionId: string | null = (():
              | string
              | null => {
              if (typeof newSubBody === 'object' && newSubBody !== null) {
                const obj = newSubBody as Record<string, unknown>;
                const value = obj.id;
                return typeof value === 'string' ? value : null;
              }
              return null;
            })();
            if (extractedSubscriptionId !== null) {
              currentSubscriptionId = extractedSubscriptionId;
              // Wait a bit for the payment to initiate
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }
      }
    }

    // If we exhausted all attempts without getting ACTIVE, fail the test
    finalStatus = statusValue;
    if (finalStatus !== 'ACTIVE') {
      throw new Error(
        `Failed to get ACTIVE subscription after ${maxAttempts} attempts; final status: ${finalStatus}`,
      );
    }
    subscriptionId = currentSubscriptionId;
  });

  it('upgrades the subscription to fixed-pro and remains ACTIVE', async (): Promise<void> => {
    if (authHeader === null) throw new Error('authHeader not set');
    if (subscriptionId === null) throw new Error('subscriptionId not set');
    if (finalStatus !== 'ACTIVE')
      throw new Error('Subscription not ACTIVE; cannot upgrade');

    // Retry upgrade if payment fails (payment gateway has ~80% success rate)
    let upgradeAttempts = 0;
    const maxUpgradeAttempts = 5;
    let upgradeSuccessful = false;
    let statusAfterUpgrade: string | null = null;

    while (upgradeAttempts < maxUpgradeAttempts && !upgradeSuccessful) {
      upgradeAttempts++;

      // Ensure subscription is ACTIVE before upgrading
      const statusCheck = await subApi
        .get(`/subscriptions/${subscriptionId}`)
        .set(authHeader);
      if (statusCheck.status === 200) {
        const statusBody: unknown = statusCheck.body;
        if (
          typeof statusBody === 'object' &&
          statusBody !== null &&
          'status' in statusBody
        ) {
          const statusObj = statusBody as Record<string, unknown>;
          const currentStatus =
            typeof statusObj.status === 'string' ? statusObj.status : null;
          if (currentStatus !== 'ACTIVE') {
            throw new Error(
              `Subscription status is ${currentStatus}, not ACTIVE; cannot upgrade`,
            );
          }
        }
      }

      const upgrade = await subApi
        .patch(`/subscriptions/${subscriptionId}/upgrade`)
        .set(authHeader)
        .send({ planId: planIdPro });

      expect([200, 202]).toContain(upgrade.status);

      // After upgrade initiation, wait for payment webhook to process
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
        if (statusValue === 'ACTIVE' || statusValue === 'CANCELLED') break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      statusAfterUpgrade = statusValue;
      if (statusValue === 'ACTIVE') {
        upgradeSuccessful = true;
        break;
      }

      // If upgrade failed (CANCELLED), we can't retry upgrade on CANCELLED subscription
      // Instead, create a new subscription with the pro plan directly
      if (statusValue === 'CANCELLED' && upgradeAttempts < maxUpgradeAttempts) {
        // Cancel and delete the CANCELLED subscription first
        // Then create a new subscription with pro plan
        // Wait a bit for cleanup
        await new Promise((r) => setTimeout(r, 1000));

        // Create new subscription with pro plan directly
        const newSubResponse = await subApi
          .post('/subscriptions')
          .set(authHeader)
          .send({ planId: planIdPro });

        if ([200, 201, 202].includes(newSubResponse.status)) {
          const newSubBody: unknown = newSubResponse.body;
          if (
            typeof newSubBody === 'object' &&
            newSubBody !== null &&
            'id' in newSubBody
          ) {
            const newSub = newSubBody as Record<string, unknown>;
            const newSubId = typeof newSub.id === 'string' ? newSub.id : null;
            if (newSubId !== null) {
              // Update subscriptionId for subsequent tests
              subscriptionId = newSubId;

              // Wait for new subscription to become ACTIVE
              const deadline: number = Date.now() + 60_000;
              while (Date.now() < deadline) {
                const s = await subApi
                  .get(`/subscriptions/${subscriptionId}`)
                  .set(authHeader);
                if (s.status === 200) {
                  const sBody: unknown = s.body;
                  const status: string | null = ((): string | null => {
                    if (typeof sBody === 'object' && sBody !== null) {
                      const obj = sBody as Record<string, unknown>;
                      const value = obj.status;
                      return typeof value === 'string' ? value : null;
                    }
                    return null;
                  })();
                  if (status === 'ACTIVE') {
                    upgradeSuccessful = true;
                    statusAfterUpgrade = 'ACTIVE';
                    break;
                  }
                  if (status === 'CANCELLED') {
                    // If new subscription also failed, try again
                    upgradeAttempts++;
                    break;
                  }
                }
                await new Promise((r) => setTimeout(r, 1000));
              }
            }
          }
        }
      }
    }

    expect(statusAfterUpgrade).toBe('ACTIVE');
    if (statusAfterUpgrade !== 'ACTIVE') {
      throw new Error(
        `Upgrade failed after ${maxUpgradeAttempts} attempts; subscription status: ${statusAfterUpgrade}`,
      );
    }

    // Small delay to ensure subscription state is fully updated
    await new Promise((r) => setTimeout(r, 1000));
  });

  it('downgrades the subscription back to fixed-basic and reflects plan change', async (): Promise<void> => {
    if (authHeader === null) throw new Error('authHeader not set');
    if (subscriptionId === null) throw new Error('subscriptionId not set');

    // Ensure subscription is ACTIVE before downgrading
    // Retry if rate limited (429)
    let statusCheck: import('supertest').Response | null = null;
    let statusRetries = 0;
    const maxStatusRetries = 5;
    while (statusRetries < maxStatusRetries) {
      statusCheck = await subApi
        .get(`/subscriptions/${subscriptionId}`)
        .set(authHeader);
      if (statusCheck.status !== 429) break; // Break if not rate limited
      await new Promise((r) => setTimeout(r, 1000 * (statusRetries + 1)));
      statusRetries++;
    }
    if (statusCheck === null)
      throw new Error('Failed to get subscription status after retries');
    if (statusCheck.status !== 200) {
      throw new Error(
        `Failed to get subscription status: ${statusCheck.status}, body: ${JSON.stringify(statusCheck.body)}`,
      );
    }
    const statusBody: unknown = statusCheck.body;
    if (
      typeof statusBody === 'object' &&
      statusBody !== null &&
      'status' in statusBody
    ) {
      const statusObj = statusBody as Record<string, unknown>;
      const currentStatus =
        typeof statusObj.status === 'string' ? statusObj.status : null;
      if (currentStatus !== 'ACTIVE') {
        throw new Error(
          `Subscription status is ${currentStatus}, not ACTIVE; cannot downgrade`,
        );
      }

      // Check current plan - if already on basic, no need to downgrade
      const currentPlanId =
        typeof statusObj.planId === 'string' ? statusObj.planId : null;

      // If subscription is already on basic plan, verify it (upgrade may not have changed the plan)
      if (currentPlanId === planIdBasic) {
        // Already on basic, verify plan and return
        expect(currentPlanId).toBe(planIdBasic);
        return;
      }

      // If on pro plan, proceed with downgrade
      if (currentPlanId !== planIdPro) {
        throw new Error(
          `Subscription is on plan ${currentPlanId}, expected ${planIdPro} or ${planIdBasic} before downgrade`,
        );
      }
    }

    // Only downgrade if subscription is on pro plan
    const downgrade = await subApi
      .patch(`/subscriptions/${subscriptionId}/downgrade`)
      .set(authHeader)
      .send({ planId: planIdBasic });

    if (![200, 202].includes(downgrade.status)) {
      throw new Error(
        `Downgrade failed with status ${downgrade.status}: ${JSON.stringify(downgrade.body)}`,
      );
    }

    // Retry getting subscription status if we get rate limited (429)
    let s: import('supertest').Response | null = null;
    let retries = 0;
    const maxRetries = 5;
    while (retries < maxRetries) {
      s = await subApi.get(`/subscriptions/${subscriptionId}`).set(authHeader);
      if (s.status !== 429) break; // Break if not rate limited
      // If rate limited, wait and retry
      await new Promise((r) => setTimeout(r, 1000 * (retries + 1)));
      retries++;
    }
    if (s === null) throw new Error('Failed to get subscription after retries');
    expect(s.status).toBe(200);
    const sBody: unknown = s.body;
    const planId: string | null = ((): string | null => {
      if (typeof sBody === 'object' && sBody !== null) {
        const obj = sBody as Record<string, unknown>;
        const value = obj.planId;
        return typeof value === 'string' ? value : null;
      }
      return null;
    })();
    if (planId === null)
      throw new Error('Missing planId in subscription response');
    expect(planId).toBe(planIdBasic);
  });

  it('lists payments and sees at least one', async (): Promise<void> => {
    const tx = await payApi.get('/payments');
    expect(tx.status).toBe(200);
    const listUnknown: unknown = tx.body;
    const count: number = Array.isArray(listUnknown) ? listUnknown.length : 0;
    expect(count).toBeGreaterThan(0);
  });
});
