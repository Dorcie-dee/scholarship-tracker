import { describe, expect, it } from 'vitest';
import { OpportunityType, StudyLevel } from '../enums';
import { inferOpportunityFields } from '../opportunity-inference';

function infer(text: string, opts: { title?: string | null; finalUrl?: string } = {}) {
  return inferOpportunityFields({
    title: opts.title ?? null,
    text,
    finalUrl: opts.finalUrl ?? 'https://example.com',
  });
}

describe('inferOpportunityFields', () => {
  describe('opportunityType', () => {
    it('detects a scholarship', () => {
      expect(infer('Apply now for the Chevening Scholarship for Masters students.').suggestedOpportunityType).toBe(
        OpportunityType.SCHOLARSHIP,
      );
    });

    it('detects a fellowship', () => {
      expect(infer('The Fulbright Fellowship supports research abroad.').suggestedOpportunityType).toBe(
        OpportunityType.FELLOWSHIP,
      );
    });

    it('detects a grant', () => {
      expect(infer('This research grant covers travel and materials costs.').suggestedOpportunityType).toBe(
        OpportunityType.GRANT,
      );
    });

    it('falls back to funding only when no more specific type is mentioned', () => {
      expect(infer('This programme provides funding and a living stipend for selected applicants.').suggestedOpportunityType).toBe(
        OpportunityType.FUNDING,
      );
    });

    it('prefers the more specific type over generic funding language in the same text', () => {
      expect(
        infer('The scholarship provides full funding, including tuition and a stipend.').suggestedOpportunityType,
      ).toBe(OpportunityType.SCHOLARSHIP);
    });

    it('picks the type mentioned most often when several appear', () => {
      const text = 'grant grant grant scholarship';
      expect(infer(text).suggestedOpportunityType).toBe(OpportunityType.GRANT);
    });

    it('returns null when nothing matches', () => {
      expect(infer('Welcome to our university admissions portal.').suggestedOpportunityType).toBeNull();
    });
  });

  describe('studyLevel', () => {
    it('detects undergraduate', () => {
      expect(infer('Open to undergraduate students entering their first bachelor degree.').suggestedStudyLevel).toBe(
        StudyLevel.UNDERGRADUATE,
      );
    });

    it('detects masters', () => {
      expect(infer("Funding for a one-year master's programme (MSc) in engineering.").suggestedStudyLevel).toBe(
        StudyLevel.MASTERS,
      );
    });

    it('detects phd', () => {
      expect(infer('Supports doctoral candidates completing a PhD in the sciences.').suggestedStudyLevel).toBe(
        StudyLevel.PHD,
      );
    });

    it('detects postdoc and does not also count it as a PhD', () => {
      const result = infer('A two-year post-doctoral fellowship for recent PhD graduates.');
      expect(result.suggestedStudyLevel).toBe(StudyLevel.POSTDOC);
    });

    it('returns null when nothing matches', () => {
      expect(infer('A general scholarship open to all students.').suggestedStudyLevel).toBeNull();
    });
  });

  describe('country', () => {
    it('detects a country from the text', () => {
      expect(infer('A scholarship for international students at a top German university.').suggestedCountry).toBe(
        'Germany',
      );
    });

    it('prefers the text over the hostname when both are present', () => {
      expect(
        infer('Study in Canada with this fully-funded scholarship.', { finalUrl: 'https://scholarships.de/page' })
          .suggestedCountry,
      ).toBe('Canada');
    });

    it('falls back to the hostname ccTLD when the text has no country cue', () => {
      expect(infer('A fully-funded scholarship for outstanding students.', { finalUrl: 'https://uni-example.de/scholarships' }).suggestedCountry).toBe(
        'Germany',
      );
    });

    it('treats a .edu hostname as a United States signal', () => {
      expect(
        infer('A fully-funded scholarship for outstanding students.', { finalUrl: 'https://scholarships.university.edu/apply' })
          .suggestedCountry,
      ).toBe('United States');
    });

    it('returns null when neither the text nor the hostname gives a cue', () => {
      expect(infer('A fully-funded scholarship for outstanding students.', { finalUrl: 'https://example.com' }).suggestedCountry).toBeNull();
    });
  });

  it('combines all three suggestions from the title and excerpt together', () => {
    const result = inferOpportunityFields({
      title: 'UK Masters Scholarship for International Students',
      text: 'This scholarship is open to students applying for a taught masters degree in the United Kingdom.',
      finalUrl: 'https://university.ac.uk/scholarships',
    });
    expect(result).toEqual({
      suggestedOpportunityType: OpportunityType.SCHOLARSHIP,
      suggestedStudyLevel: StudyLevel.MASTERS,
      suggestedCountry: 'United Kingdom',
    });
  });
});
