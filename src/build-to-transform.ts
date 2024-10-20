import type * as esbuild from 'esbuild';

const dropKeys = [
  'bundle',
  'splitting',
  'preserveSymlinks',
  'outfile',
  'metafile',
  'outdir',
  'outbase',
  'external',
  'packages',
  'alias',
  'loader',
  'resolveExtensions',
  'mainFields',
  'conditions',
  'write',
  'allowOverwrite',
  'tsconfig',
  'outExtension',
  'publicPath',
  'entryNames',
  'chunkNames',
  'assetNames',
  'inject',
  'banner',
  'footer',
  'entryPoints',
  'stdin',
  'plugins',
  'absWorkingDir',
  'nodePaths',
] as const;

export function toTransform(opts: esbuild.BuildOptions, language?: string): esbuild.TransformOptions {
  const newOpts = Object.fromEntries(
    Object.entries(opts)
      .reduce((accumulator, [name, value]) => {
        if (dropKeys.includes(name as typeof dropKeys[number])) return accumulator;

        accumulator.push([name, value]);
        return accumulator;
      }, [] as [string, unknown][]),
  );

  if (!language) return newOpts;

  return {
    ...newOpts,
    ...(opts.banner?.[language] ? { banner: opts.banner?.[language] } : {}),
    ...(opts.footer?.[language] ? { footer: opts.footer?.[language] } : {}),
    ...(opts.loader?.[language] ? { loader: opts.loader?.[language] } : {}),
  }
}
