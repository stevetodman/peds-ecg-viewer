/**
 * Age group tests
 */

import { describe, it, expect } from 'vitest';
import {
  AGE_GROUPS,
  getAgeGroup,
  getAgeGroupById,
  isNeonate,
  isInfant,
  isPediatric,
  ageToDays,
} from '../../../src/data/ageGroups';

describe('AGE_GROUPS', () => {
  it('should have 13 age groups', () => {
    expect(AGE_GROUPS).toHaveLength(13);
  });

  it('should have contiguous age ranges', () => {
    for (let i = 1; i < AGE_GROUPS.length; i++) {
      expect(AGE_GROUPS[i].minDays).toBe(AGE_GROUPS[i - 1].maxDays);
    }
  });

  it('should start at day 0', () => {
    expect(AGE_GROUPS[0].minDays).toBe(0);
  });

  it('should end at 18 years', () => {
    const lastGroup = AGE_GROUPS[AGE_GROUPS.length - 1];
    expect(lastGroup.maxDays).toBe(6575); // 18 years
  });

  it('should have unique IDs', () => {
    const ids = AGE_GROUPS.map(g => g.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('getAgeGroup', () => {
  it('should return neonate_0_24h for age 0', () => {
    expect(getAgeGroup(0).id).toBe('neonate_0_24h');
  });

  it('should return neonate_1_3d for age 1-2 days (transitional)', () => {
    expect(getAgeGroup(1).id).toBe('neonate_1_3d');
    expect(getAgeGroup(2).id).toBe('neonate_1_3d');
  });

  it('should return neonate_3_7d for age 3-7 days (post-transitional)', () => {
    expect(getAgeGroup(3).id).toBe('neonate_3_7d');
    expect(getAgeGroup(5).id).toBe('neonate_3_7d');
    expect(getAgeGroup(7).id).toBe('neonate_3_7d');
  });

  it('should return infant_1_3mo for age 60 days', () => {
    expect(getAgeGroup(60).id).toBe('infant_1_3mo');
  });

  it('should return toddler_1_3yr for age 2 years', () => {
    const twoyears = ageToDays(2, 'years');
    expect(getAgeGroup(twoyears).id).toBe('toddler_1_3yr');
  });

  it('should return child_8_12yr for age 10 years', () => {
    const tenyears = ageToDays(10, 'years');
    expect(getAgeGroup(tenyears).id).toBe('child_8_12yr');
  });

  it('should return adolescent_16_18yr for age 17 years', () => {
    const seventeenyears = ageToDays(17, 'years');
    expect(getAgeGroup(seventeenyears).id).toBe('adolescent_16_18yr');
  });

  it('should return last group for age > 18 years', () => {
    const twentyyears = ageToDays(20, 'years');
    expect(getAgeGroup(twentyyears).id).toBe('adolescent_16_18yr');
  });

  it('should handle negative age gracefully', () => {
    expect(getAgeGroup(-1).id).toBe('neonate_0_24h');
  });
});

describe('getAgeGroupById', () => {
  it('should return correct group by ID', () => {
    const group = getAgeGroupById('infant_6_12mo');
    expect(group).toBeDefined();
    expect(group?.label).toBe('6-12 months');
  });

  it('should return undefined for invalid ID', () => {
    expect(getAgeGroupById('invalid')).toBeUndefined();
  });
});

describe('isNeonate', () => {
  it('should return true for age 0-30 days', () => {
    expect(isNeonate(0)).toBe(true);
    expect(isNeonate(15)).toBe(true);
    expect(isNeonate(30)).toBe(true);
  });

  it('should return false for age > 30 days', () => {
    expect(isNeonate(31)).toBe(false);
    expect(isNeonate(100)).toBe(false);
  });
});

describe('isInfant', () => {
  it('should return true for age 1-12 months', () => {
    expect(isInfant(60)).toBe(true);
    expect(isInfant(180)).toBe(true);
    expect(isInfant(300)).toBe(true);
  });

  it('should return false for neonates', () => {
    expect(isInfant(15)).toBe(false);
  });

  it('should return false for toddlers', () => {
    expect(isInfant(400)).toBe(false);
  });
});

describe('isPediatric', () => {
  it('should return true for age < 18 years', () => {
    expect(isPediatric(0)).toBe(true);
    expect(isPediatric(3000)).toBe(true);
    expect(isPediatric(6574)).toBe(true);
  });

  it('should return false for age >= 18 years', () => {
    expect(isPediatric(6575)).toBe(false);
    expect(isPediatric(10000)).toBe(false);
  });
});

describe('ageToDays', () => {
  it('should convert days correctly', () => {
    expect(ageToDays(5, 'days')).toBe(5);
  });

  it('should convert weeks correctly', () => {
    expect(ageToDays(2, 'weeks')).toBe(14);
  });

  it('should convert months correctly', () => {
    const result = ageToDays(1, 'months');
    expect(result).toBeGreaterThanOrEqual(30);
    expect(result).toBeLessThanOrEqual(31);
  });

  it('should convert years correctly', () => {
    const result = ageToDays(1, 'years');
    expect(result).toBeGreaterThanOrEqual(365);
    expect(result).toBeLessThanOrEqual(366);
  });
});
