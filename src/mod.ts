#!/usr/bin/env false

import process from 'node:process';
import { dirname, join, relative } from 'node:path';
import { readFile } from 'node:fs/promises';
import type * as esbuild from 'esbuild';
import { minify } from 'npm:html-minifier';
import { DOMParser } from 'jsr:@b-fuze/deno-dom';
import { toTransform } from "#/build-to-transform.ts";

export type Props = Partial<{
  esbuildOptions: esbuild.CommonOptions,
  buildOptions: esbuild.BuildOptions,
  transformOptions: esbuild.TransformOptions,
  minify: boolean,
}>;

export function htmlPlugin(opts: Props = {}): esbuild.Plugin {
  const pluginName = 'HTML';
  const filter = /\.html$/;
  const parser = new DOMParser();

  return {
    name: pluginName,
    setup(build) {
      const results: esbuild.BuildResult[] = [];

      build.onResolve({ filter }, ({ path }) => ({ path, namespace: pluginName }));
      build.onLoad({ filter, namespace: pluginName }, async (args) => {
        if (!build.initialOptions.outdir) throw new Error('Muse use "outdir" when building HTML');
        const accurateResult = (result: esbuild.BuildResult): esbuild.BuildResult => {
          if (result.metafile) return {
            ...result,
            metafile: {
              inputs: Object.fromEntries(Object.entries(result.metafile.inputs).map(([file, value]) => [
                file,
                {
                  ...value,
                  imports: [{
                    kind: 'url-token',
                    path: relative(process.cwd(), args.path),
                  }],
                },
              ])),
              outputs: result.metafile.outputs,
            },
          };

          return result;
        };

        const watchFiles = [args.path];
        const warnings: esbuild.Message[] = [];

        const fileContent = await readFile(args.path, 'utf8');
        const document = parser.parseFromString(fileContent, 'text/html');
        if (!document) return {
          errors: [{
            id: 'invalid-html',
            text: 'Failed to parse HTML.',
            pluginName,
          }],
        };

        const scripts = document.getElementsByTagName('script');
        for (const script of scripts) {
          if (['importmap', 'speculationrules'].includes(script.getAttribute('type')!)) continue;

          const options: esbuild.CommonOptions = {
            ...build.initialOptions,
            logLevel: 'error',
            ...opts.esbuildOptions,
            format: script.getAttribute('type') === 'module' ? 'esm' : 'cjs',
            platform: 'browser',
          };

          if (script.hasAttribute('src')) {
            const src = script.getAttribute('src')!;

            const path = join(dirname(args.path), src);
            watchFiles.push(path);

            const buildOptions = {
              ...options,
              ...opts.buildOptions,
              entryPoints: [path],
              metafile: true,
              outdir: join(build.initialOptions.outdir, src, '..'),
            } as const satisfies esbuild.BuildOptions;

            const result = await build.esbuild.build(buildOptions);
            results.push(accurateResult(result));
            warnings.push(...result.warnings);

            if (result.errors.length > 0) return { errors: result.errors, pluginName };
            const outputFile = Object.keys(result.metafile.outputs)[0]!;
            watchFiles.push(...result.metafile.outputs[outputFile]!.imports.map(input => input.path));

            script.setAttribute('src', relative(buildOptions.outdir, outputFile));
          } else {
            if (!script.textContent) return {
              errors: [{
                id: 'no-content-or-src',
                text: 'Script has no content or src defined.',
                pluginName,
              }],
            };

            const result = await build.esbuild.transform(script.textContent, {
              ...toTransform(options, 'js'),
              ...opts.transformOptions,
            }).catch(e => e as esbuild.TransformFailure);

            if ('errors' in result) return { errors: result.errors, pluginName };

            warnings.push(...result.warnings);
            script.textContent = result.code.trim();
          }
        }

        const links = document.getElementsByTagName('link');
        for (const link of links) {
          if (link.getAttribute('rel') !== 'stylesheet') continue;

          if (!link.hasAttribute('href')) return {
            errors: [{
              id: 'no-href',
              text: 'Link has no href defined.',
              pluginName,
            }],
          };

          const path = join(dirname(args.path), link.getAttribute('href')!);
          watchFiles.push(path);

          const outdir = join(build.initialOptions.outdir, link.getAttribute('href')!, '..');
          const result = await build.esbuild.build({
            bundle: true,
            ...build.initialOptions,
            ...opts.esbuildOptions,
            ...opts.buildOptions,
            entryPoints: [path],
            outdir,
            metafile: true,
            loader: {
              '.css': link.getAttribute('local') === 'true' || path.split('.').at(-2) === 'module'
                ? 'local-css'
                : 'css',
            },
          });

          results.push(accurateResult(result));
          warnings.push(...result.warnings);

          if (result.errors.length > 0) return { errors: result.errors, pluginName };
          const outputFile = Object.keys(result.metafile.outputs)[0]!;
          watchFiles.push(...Object.keys(result.metafile.outputs[outputFile]!.inputs).map(p => join(process.cwd(), p)));

          link.setAttribute('href', relative(outdir, outputFile));
        }

        const styles = document.getElementsByTagName('style');
        for (const style of styles) {
          if (!style.textContent) return {
            errors: [{
              id: 'no-content',
              text: 'Style has no content defined.',
              pluginName,
            }],
          };

          const result = await build.esbuild.transform(style.textContent, {
            ...toTransform(build.initialOptions, 'css'),
            ...opts.esbuildOptions,
            ...opts.transformOptions,
            loader: style.getAttribute('local') === 'true' ? 'local-css' : 'css',
          }).catch(e => e as esbuild.TransformFailure);

          if ('errors' in result) return { errors: result.errors, pluginName };

          warnings.push(...result.warnings);
          style.textContent = result.code.trim();
        }

        const doctype = fileContent.split('\n').find(line => /^\s*<!doctype/i.test(line));
        const contents = (doctype ? `${doctype}\n` : '') + document.documentElement!.outerHTML;

        return {
          contents: build.initialOptions.minify || opts.minify ? minify(contents) : contents,
          loader: 'copy',
          watchFiles,
          pluginName,
        };
      });

      build.onEnd((result) => {
        for (const customResult of results) {
          result.errors.push(...customResult.errors);
          result.warnings.push(...customResult.warnings);
          if (customResult.outputFiles) result.outputFiles?.push(...customResult.outputFiles);

          if (result.metafile && customResult.metafile) {
            for (const input in customResult.metafile.inputs) result.metafile.inputs[input] = customResult.metafile.inputs[input]!;
            for (const input in customResult.metafile.outputs) result.metafile.outputs[input] = customResult.metafile.outputs[input]!;
          }

          if (result.mangleCache && customResult.mangleCache)
            for (const key in customResult.mangleCache) result.mangleCache[key] = customResult.mangleCache[key]!;
        }
      });
    },
  };
}
