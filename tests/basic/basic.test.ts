import { join } from '@std/path';
import { assert } from '@std/assert';
import { build } from '../mod.ts';

const decoder = new TextDecoder();

Deno.test('script transform', async () => {
  const result = await build(join(import.meta.dirname!, './script-transform.html'));
  const text = decoder.decode(result.outputFiles[0]!.contents);

  assert(Object.keys(result.outputFiles).length === 1);
  assert(text.includes('console.log('));
});

Deno.test('style transform', async () => {
  const result = await build(join(import.meta.dirname!, './style-transform.html'));
  const text = decoder.decode(result.outputFiles[0]!.contents);

  assert(Object.keys(result.outputFiles).length === 1);
  assert(text.includes('.test'));
  assert(text.includes('color:'));
});

Deno.test('normal doctype', async () => {
  const result = await build(join(import.meta.dirname!, './normal-doctype.html'));
  const text = decoder.decode(result.outputFiles[0]!.contents);

  assert(text.startsWith('<!DOCTYPE html>'));
});

Deno.test('quirks doctype', async () => {
  const result = await build(join(import.meta.dirname!, './quirks-doctype.html'));
  const text = decoder.decode(result.outputFiles[0]!.contents);

  assert(text.startsWith('<!DOCTYPE HTML PUBLIC'));
});

Deno.test('no doctype', async () => {
  const result = await build(join(import.meta.dirname!, './no-doctype.html'));
  const text = decoder.decode(result.outputFiles[0]!.contents);

  assert(!text.startsWith('<!DOCTYPE html>'));
});
