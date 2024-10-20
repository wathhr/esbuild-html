import { join } from '@std/path';
import { assert } from '@std/assert';
import { build } from '../mod.ts';

const decoder = new TextDecoder();

Deno.test('script src', async () => {
  const result = await build(join(import.meta.dirname!, './script-src.html'));
  const text = decoder.decode(result.outputFiles[0]!.contents);
  console.log(result);

  assert(result.outputFiles.length === 2);
  assert(text.includes('troll.js'));
});

Deno.test('style link', async () => {
  const result = await build(join(import.meta.dirname!, './style-link.html'));
  const text = decoder.decode(result.outputFiles[1]!.contents);

  assert(result.outputFiles.length === 2);
  assert(text.includes('content:'));
  assert(text.includes('troll'));
});
