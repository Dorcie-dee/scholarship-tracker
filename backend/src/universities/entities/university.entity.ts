import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Programme } from '../../programmes/entities/programme.entity';

/**
 * Production hardening (Batch 18, final scalability review) — `(name, id)`
 * composite index. `UniversitiesService.findAll()`'s default (no `?search=`)
 * keyset pagination sorts and filters on exactly this pair
 * (`common/pagination/cursor.ts`'s `WHERE (name > :cursor) OR (name =
 * :cursor AND id > :cursorId) ORDER BY name, id` — a composite btree on
 * `(name, id)` is the textbook-correct index for exactly that shape, not a
 * speculative addition). `id` alone already has the primary key's own
 * index, but that can't serve a query ordered by `name` first — this is
 * genuinely a different index, not a duplicate. Universities is a shared,
 * unscoped, catalog-wide table (unlike per-user-owned tables, where the
 * existing `owner_id`/`journey_id` FK indexes already bound any single
 * query to one user's own, naturally small row set regardless of total
 * platform growth) — exactly the case where growing catalog size would
 * otherwise force a full-table sort on every unfiltered browse.
 *
 * Does NOT help `?search=` — that's a leading-wildcard `ILIKE '%term%'`
 * (see `findAll()`'s own comment), which no plain btree index can
 * accelerate regardless of which columns it covers; a trigram (`pg_trgm`)
 * index would be the correct fix for that specific query shape, but adding
 * a new Postgres extension dependency was assessed as premature without
 * concrete evidence search performance is an actual bottleneck at this
 * project's current or realistically-projected scale — see
 * docs/decisions.md, "Batch 18".
 */
@Entity('universities')
@Index(['name', 'id'])
export class University extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  website: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => Programme, (programme) => programme.university)
  programmes?: Programme[];
}
