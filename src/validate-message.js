import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../schema/uss-p-message.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export function validateMessage(message) {
  const valid = validateSchema(message);
  const errors = (validateSchema.errors || []).map((error) => `${error.instancePath || '/'} ${error.message}`.trim());

  if (message && typeof message === 'object') {
    const createdAt = Date.parse(message.createdAt);
    const expiresAt = Date.parse(message.expiresAt);
    if (Number.isFinite(createdAt) && Number.isFinite(expiresAt)) {
      if (expiresAt <= createdAt) errors.push('/expiresAt must be later than /createdAt');
      if (message.category === 'otp' && expiresAt - createdAt > 10 * 60 * 1000) errors.push('/expiresAt OTP lifetime must not exceed ten minutes');
    }
    const basisAt = Date.parse(message.basis?.occurredAt);
    const basisExpiry = message.basis?.expiresAt ? Date.parse(message.basis.expiresAt) : null;
    if (Number.isFinite(createdAt) && Number.isFinite(basisAt) && basisAt > createdAt) errors.push('/basis/occurredAt must not be later than /createdAt');
    if (Number.isFinite(createdAt) && Number.isFinite(basisExpiry) && basisExpiry <= createdAt) errors.push('/basis/expiresAt must be later than /createdAt');
    if (/^(?:\+?\d{7,}|\+?[\d ()-]{8,})$/.test(message.recipient?.recipientRef || '')) errors.push('/recipient/recipientRef must not contain a phone number');
    if (message.category === 'otp' && /(?:https?:\/\/|www\.)/i.test(message.content?.text || '')) {
      errors.push('/content/text OTP messages must not contain links');
    }
    for (const [index, link] of (message.links || []).entries()) {
      try {
        const url = new URL(link.url);
        if (!message.sender?.trustedDomains?.includes(url.hostname)) errors.push(`/links/${index}/url host is not listed in sender.trustedDomains`);
      } catch { /* The JSON Schema format check reports malformed URLs. */ }
    }
  }

  return { valid: Boolean(valid) && errors.length === 0, errors };
}
