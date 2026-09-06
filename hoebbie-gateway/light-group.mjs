/** HA Hue groups expose is_hue_group; generic light groups expose members. */
export function isLightGroup(attributes) {
  return attributes?.is_hue_group === true || (Array.isArray(attributes?.entity_id) && attributes.entity_id.length > 0);
}
