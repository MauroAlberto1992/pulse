import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, Config } from '../config';

export type Series = {
  newPractitioners: number[];
  newPatients: number[];
  deletedPatients: number[];
  consultations: number[];
  invoices: number[];
  invoicedAmount: number[];
  failedInvoices: number[];
  referrals: number[];
};

/** Mirrors api_cp's src/metrics/business-metrics.ts (BusinessMetrics). */
export interface BusinessMetrics {
  generatedAt: string;
  months: string[];
  weeks: string[];
  totals: {
    practitioners: number;
    activePractitioners: number;
    patients: number;
    deletedPatients: number;
    consultations: number;
    invoices: number;
    failedInvoices: number;
    invoicedAmount: number;
    referrals: number;
  };
  monthly: Series;
  weekly: Series;
  byPractitionerType: Array<{
    type: string;
    practitioners: number;
    activePractitioners: number;
    patients: number;
    consultations: number;
    invoicedAmount: number;
  }>;
}

const CACHE_MS = 10 * 60_000;

/** Reads the aggregated numbers from api_cp. Business numbers move slowly: cached 10 minutes. */
@Injectable()
export class BusinessService {
  private cached: { at: number; value: BusinessMetrics } | null = null;

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  async metrics(
    fetchFn: typeof fetch = fetch,
    now = Date.now(),
  ): Promise<BusinessMetrics | { error: string } | null> {
    const { businessMetricsUrl: url, metricsSecret: secret } = this.config;
    if (url === null || secret === null) {
      return null;
    }
    if (this.cached !== null && now - this.cached.at < CACHE_MS) {
      return this.cached.value;
    }
    try {
      const response = await fetchFn(url, {
        headers: { 'x-metrics-secret': secret, 'user-agent': 'pulse-monitor' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok === false) {
        return { error: `api_cp answered HTTP ${response.status}` };
      }
      const value = (await response.json()) as BusinessMetrics;
      this.cached = { at: now, value };
      return value;
    } catch (error) {
      return {
        error:
          (error as Error).name === 'TimeoutError'
            ? 'api_cp timed out'
            : 'api_cp unreachable',
      };
    }
  }
}
