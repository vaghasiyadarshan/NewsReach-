import type { Machine, MachineStatus } from '../../domain/model/machine.ts';
import type { MachineRepository } from '../../application/ports/repositories.ts';
import type { Queryable } from './pool.ts';

export class PostgresMachineRepository implements MachineRepository {
  constructor(private readonly q: Queryable) {}

  async list(): Promise<Machine[]> {
    const { rows } = await this.q.query<{ id: string; name: string; status: MachineStatus }>(
      'SELECT id, name, status FROM machines ORDER BY id COLLATE "C"',
    );
    return rows;
  }

  async insertMany(machines: readonly Machine[]): Promise<void> {
    for (const m of machines) {
      await this.q.query('INSERT INTO machines (id, name, status) VALUES ($1, $2, $3)', [m.id, m.name, m.status]);
    }
  }
}
