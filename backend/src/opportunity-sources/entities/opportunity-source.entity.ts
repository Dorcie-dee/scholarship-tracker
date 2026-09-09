import { OpportunitySourceType, SourceAuthorityLevel } from '../../types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';

/**
 * Where an Opportunity's information came from, and a preserved snapshot of the
 * *relevant* content used to create/update it (spec §14).
 *
 * IMPORTANT: `extractedContent` is meant to hold the relevant excerpt used at
 * capture time — NOT a full archive of the source page/email. Preserving whole
 * external websites is explicitly out of scope.
 */
@Entity('opportunity_sources')
export class OpportunitySource extends BaseEntity {
  @ManyToOne(() => Opportunity, (opportunity) => opportunity.sources, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @Index()
  @Column({ type: 'uuid', name: 'opportunity_id' })
  opportunityId: string;

  @Column({
    type: 'enum',
    enum: OpportunitySourceType,
    name: 'source_type',
    default: OpportunitySourceType.MANUAL_ENTRY,
  })
  sourceType: OpportunitySourceType;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'source_name' })
  sourceName: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'source_url' })
  sourceUrl: string | null;

  @Column({ type: 'timestamptz', name: 'captured_at' })
  capturedAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'published_at' })
  publishedAt: Date | null;

  /** The relevant excerpt used at capture time — not a full page archive. */
  @Column({ type: 'text', nullable: true, name: 'extracted_content' })
  extractedContent: string | null;

  @Column({
    type: 'enum',
    enum: SourceAuthorityLevel,
    name: 'authority_level',
    default: SourceAuthorityLevel.UNVERIFIED,
  })
  authorityLevel: SourceAuthorityLevel;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
