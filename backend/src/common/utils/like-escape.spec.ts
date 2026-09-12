import { escapeLikePattern, likeContainsPattern } from './like-escape';

describe('escapeLikePattern', () => {
  it('escapes %, _, and backslash', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('leaves ordinary text unchanged', () => {
    expect(escapeLikePattern('jane@example.com')).toBe('jane@example.com');
  });

  it('builds a contains pattern', () => {
    expect(likeContainsPattern('100%')).toBe('%100\\%%');
  });
});
