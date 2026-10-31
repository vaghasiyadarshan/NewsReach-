import type { Machine } from '../../domain/models/machine.ts';
import type { UnitOfWork } from '../port/repositories.ts';

export class ListMachines {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(): Promise<Machine[]> {
    return this.uow.run((repos) => repos.machines.list());
  }
}
