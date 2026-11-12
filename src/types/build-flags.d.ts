/**
 * esbuild.config.mjs の `define` が置き換えるビルド時の旗。
 * production build では false（開発用の計測は bundle に入らない）、dev build では true。
 * define のない build（試験が直接 bundle する場合など）では未定義なので、`typeof` で確かめてから読む。
 */
declare const __TATEGAKI_DEV__: boolean | undefined;
