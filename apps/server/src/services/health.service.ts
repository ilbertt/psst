import type { HealthRepository } from '#repositories/health.repository.ts';

export class HealthService {
  private readonly healthRepo: HealthRepository;

  constructor(healthRepo: HealthRepository) {
    this.healthRepo = healthRepo;
  }

  check(): { status: 'ok'; uptime: number } {
    this.healthRepo.ping();
    return { status: 'ok', uptime: process.uptime() };
  }
}
