import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('assets', { recursive: true });
const mark =
  '<path d="M400 155h224v245h245v224H624v245H400V624H155V400h245z" fill="white"/><circle cx="825" cy="196" r="104" fill="#F7C8CE"/>';
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="220" fill="#B42332"/><g transform="translate(160 160) scale(.6875)">${mark}</g></svg>`;
await sharp(Buffer.from(icon)).resize(1024).png().toFile('assets/icon.png');
await sharp(Buffer.from(icon)).resize(64).png().toFile('assets/favicon.png');
await sharp(Buffer.from(icon)).resize(288).png().toFile('assets/splash-icon.png');
const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate(250 250) scale(.51)">${mark}</g></svg>`;
await sharp(Buffer.from(adaptive)).resize(1024).png().toFile('assets/android-icon-foreground.png');
// A local image used only by gallery-upload tests, not a patient photograph.
const fixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#DCC3A9"/><ellipse cx="400" cy="400" rx="120" ry="100" fill="#AD7260"/><ellipse cx="400" cy="400" rx="85" ry="72" fill="#CDA687"/></svg>';
await mkdir('tests/fixtures', { recursive: true });
await sharp(Buffer.from(fixture)).png().toFile('tests/fixtures/lesion-photo.png');
