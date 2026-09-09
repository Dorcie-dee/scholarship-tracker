import { RequirementStatus, RequirementType } from '../../types';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';
import { Application } from '../../applications/entities/application.entity';

/**
 * A single thing that must or should be satisfied (spec §15).
 *
 * V1 simplification (see docs/decisions.md): a Requirement can belong to an
 * Opportunity and/or an Application via two independent nullable FKs, rather
 * than a fully separate Opportunity-Requirement vs Application-Requirement
 * model with explicit Evidence linking. This is intentional and documented as
 * a point to revisit once real usage reveals whether the distinction matters.
 *
 * `status` intentionally includes AI-oriented states (PROFILE_MATCH,
 * AI_ASSESSMENT) so the schema won't need to change when AI evaluation is
 * added later — nothing in this phase writes those states (spec §29, no AI yet).
 *
 * Group B / F5: `RequirementsService.create()` already enforces "at least
 * one of opportunityId/applicationId" at the service layer — this CHECK
 * constraint is a second, DB-level line of defense for exactly the case
 * that layer alone can't cover: any future write path (a bulk script, a
 * future ingestion pipeline, a different service) that doesn't go through
 * this one method. See docs/decisions.md.
 */
@Entity('requirements')
@Check(`"opportunity_id" IS NOT NULL OR "application_id" IS NOT NULL`)
export class Requirement extends BaseEntity {
  @Column({
    type: 'enum',
    enum: RequirementType,
    name: 'requirement_type',
    default: RequirementType.OTHER,
  })
  requirementType: RequirementType;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: RequirementStatus,
    default: RequirementStatus.UNKNOWN,
  })
  status: RequirementStatus;

  @ManyToOne(() => Opportunity, (opportunity) => opportunity.requirements, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity | null;

  @Index()
  @Column({ type: 'uuid', name: 'opportunity_id', nullable: true })
  opportunityId: string | null;

  @ManyToOne(() => Application, (application) => application.requirements, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application: Application | null;

  @Index()
  @Column({ type: 'uuid', name: 'application_id', nullable: true })
  applicationId: string | null;

  /**
   * Track 1 Group C / I6 — provenance only, set once at copy time by
   * ApplicationsService.create() (see its doc comment). Records which
   * Opportunity-scoped Requirement this Application-scoped Requirement was
   * copied FROM — never live synchronization: later changes to (or deletion
   * of) the source row never alter this one. `onDelete: 'SET NULL'` reflects
   * that directly — losing the breadcrumb is fine; the copied row itself
   * must never be touched. Self-referencing FK (same pattern as
   * Task.dependsOnTaskId / Document.previousVersionId) rather than a
   * separate join table — a single nullable column is the minimum
   * representation this needs. Deliberately NOT indexed: this is a
   * provenance/reference field, not a high-volume lookup path (see
   * docs/decisions.md).
   */
  @ManyToOne(() => Requirement, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'copied_from_requirement_id' })
  copiedFromRequirement: Requirement | null;

  @Column({
    type: 'uuid',
    name: 'copied_from_requirement_id',
    nullable: true,
  })
  copiedFromRequirementId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
