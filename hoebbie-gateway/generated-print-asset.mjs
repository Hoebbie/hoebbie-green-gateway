// Server-claimed immutable generated assets only; never URLs or paths from a model.
export const isGeneratedAsset = key => typeof key === 'string' && /^alfred-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-v1$/.test(key);
export const validGeneratedMetadata = value => value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) && Number.isInteger(value.bytes) && value.bytes >= 1800 && value.bytes <= 12000000 && typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt));
