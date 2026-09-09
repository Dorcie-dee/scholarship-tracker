import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Shared columns for every entity in the domain model: a UUID primary key plus
 * standard audit timestamps. Kept as a plain abstract class (not a decorator-
 * generating factory) so TypeORM's column metadata resolution stays simple and
 * explicit — see docs/decisions.md, "avoid premature abstraction".
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
