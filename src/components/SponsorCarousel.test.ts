import { describe, expect, it } from 'vitest'
import { withSponsorUtm } from './SponsorCarousel'

describe('withSponsorUtm', () => {
  it('preserves existing URL data while adding sponsor attribution', () => {
    const url = new URL(withSponsorUtm('https://sponsor.test/path?plan=pro#pricing'))

    expect(url.searchParams.get('plan')).toBe('pro')
    expect(url.searchParams.get('utm_source')).toBe('erdbuilderpro.com')
    expect(url.searchParams.get('utm_medium')).toBe('referral')
    expect(url.searchParams.get('utm_campaign')).toBe('sponsor')
    expect(url.hash).toBe('#pricing')
  })
})
