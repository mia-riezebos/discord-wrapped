/* Sponsor tiers and the mapping from campaign rows to what the page shows. Shared by the Worker and its tests. */
export const SPONSORS_URL = 'https://github.com/sponsors/mia-riezebos';

// seconds: how long each ad stays up per turn in its carousel.
export const TIERS = {
  square: {name: 'Square', slot: 'square', width: 160, height: 160, seconds: 8, rails: 1},
  tower: {name: 'Tower', slot: 'tower', width: 160, height: 600, seconds: 12, rails: 1},
  twin: {name: 'Twin towers', slot: 'tower', width: 160, height: 600, seconds: 15, rails: 2},
};

export const ACTIVE_SQL = `SELECT id, sponsor, tier, placement, alt, link_url, image_url FROM campaigns
  WHERE datetime(starts_at) <= datetime(?1) AND datetime(ends_at) > datetime(?1) ORDER BY id`;

export function toAd(row) {
  const tier = TIERS[row.tier];
  if (!tier || !/^https:\/\//.test(row.link_url) || !/^https:\/\//.test(row.image_url)) return null;
  return {
    id: row.id, sponsor: row.sponsor, tier: row.tier, slot: tier.slot, width: tier.width, height: tier.height, seconds: tier.seconds,
    rails: tier.rails === 2 ? ['left', 'right'] : [row.placement === 'left' ? 'left' : 'right'],
    image: `/api/ads/${row.id}/image`, href: row.link_url, alt: row.alt,
  };
}
