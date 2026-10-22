import { loadAllSchemas, validate, SCHEMA_IDS } from '../../kernel/schema-validator/dist/index.js';
import { fileURLToPath } from 'node:url';
let loaded;
export async function validateDeck(deck) {
  loaded ??= loadAllSchemas(fileURLToPath(new URL('../../schemas/', import.meta.url)));
  await loaded;
  const result = validate(SCHEMA_IDS.deckSpec, deck);
  if (!result.valid) throw new Error(`DeckSpec schema failed: ${result.errors.join('; ')}`);
  if (new Set(deck.slides.map((slide) => slide.id)).size !== deck.slides.length) throw new Error('Duplicate slide ID');
  return deck;
}
