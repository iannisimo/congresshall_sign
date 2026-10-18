// Generates the generic logo library (src/server/generic-logos): Lucide icons, in white on a coloured
// rounded square. Lucide is ISC licensed (some icons MIT, from Feather); its license is copied along.
// Run after changing the list: node scripts/generate-generic-logos.mjs
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EMBLEMS = [
  ['congresso', 'Congresso', 'presentation', '#10508c'],
  ['universita', 'Università', 'graduation-cap', '#1e40af'],
  ['formazione', 'Scuola e formazione', 'book-open', '#0871d4'],
  ['medicina', 'Medicina', 'stethoscope', '#0f8b7d'],
  ['cardiologia', 'Cardiologia', 'heart-pulse', '#c0392b'],
  ['ricerca', 'Ricerca e scienza', 'microscope', '#6d28d9'],
  ['tecnologia', 'Tecnologia', 'cpu', '#334155'],
  ['istituzioni', 'Istituzioni ed enti pubblici', 'landmark', '#1e3a8a'],
  ['aziende', 'Aziende', 'briefcase-business', '#475569'],
  ['associazioni', 'Associazioni', 'users', '#b45309'],
  ['legale', 'Legale', 'scale', '#7c2d12'],
  ['finanza', 'Economia e finanza', 'trending-up', '#047857'],
  ['cultura', 'Arte e cultura', 'palette', '#be185d'],
  ['musica', 'Musica e spettacolo', 'eighth-notes', '#7e22ce'],
  ['sport', 'Sport', 'trophy', '#a16207'],
  ['ambiente', 'Ambiente', 'leaf', '#15803d'],
  ['internazionale', 'Internazionale', 'globe', '#0369a1'],
  ['turismo', 'Turismo e ospitalità', 'hotel', '#0e7490'],
  ['comunicazione', 'Media e comunicazione', 'megaphone', '#db2777'],
  ['volontariato', 'Volontariato', 'hand-heart', '#e11d48'],
];

const root = new URL('../', import.meta.url);
const icons = new URL('node_modules/lucide-react/dist/esm/icons/', root);
const out = fileURLToPath(new URL('src/server/generic-logos/', root));

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function element([tag, attributes]) {
  const attrs = Object.entries(attributes)
    .filter(([name]) => name !== 'key')
    .map(([name, value]) => `${name}="${escape(value)}"`)
    .join(' ');
  return `<${tag} ${attrs}/>`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const catalog = [];
for (const [id, name, icon, color] of EMBLEMS) {
  // Use real icon names: aliases (like music → eighth-notes) don't export the data.
  const { __iconData } = await import(new URL(`${icon}.mjs`, icons).href);
  const shapes = __iconData.node.map(element).join('');
  // 24 px icon grid scaled to 320 px, centred in a 512 px tile.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${color}"/><g transform="translate(96 96) scale(13.3333)" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>\n`;
  writeFileSync(`${out}/${id}.svg`, svg);
  catalog.push({ id, name });
}
writeFileSync(`${out}/catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`);
copyFileSync(new URL('node_modules/lucide-react/LICENSE', root), `${out}/LICENSE`);
console.log(`${catalog.length} emblems written to src/server/generic-logos (${readdirSync(out).length} files)`);
