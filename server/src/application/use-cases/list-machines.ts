import type { Machine } from '../../domain/model/machine.ts';
import type { UnitOfWork } from '../ports/repositories.ts';

export class ListMachines {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(): Promise<Machine[]> {
    return this.uow.run((repos) => repos.machines.list());
  }
}
