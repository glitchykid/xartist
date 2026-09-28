import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('release is published only after both expected files upload successfully', async () => {
  const read = fs.readFile,
    access = fs.access,
    network = globalThis.fetch,
    log = console.log;
  const pkg = JSON.parse(await read('package.json', 'utf8'));
  const previousEnv = {
    GH_TOKEN: process.env.GH_TOKEN,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    RELEASE_TAG: process.env.RELEASE_TAG,
  };
  Object.assign(process.env, {
    GH_TOKEN: 'mock-token',
    GITHUB_REPOSITORY: 'fixture/studio',
    RELEASE_TAG: `v${pkg.version}`,
  });
  const uploaded = [];
  let published = false;
  try {
    fs.access = async (file) => {
      assert.ok(String(file).startsWith('release/'));
    };
    fs.readFile = async (file, ...args) =>
      String(file).startsWith('release/') ? Buffer.from('mock artifact') : read(file, ...args);
    console.log = () => {};
    globalThis.fetch = async (url, options) => {
      const u = new URL(url);
      assert.equal(options.headers.Authorization, 'Bearer mock-token');
      assert.ok(['api.github.com', 'uploads.github.com'].includes(u.hostname));
      if (u.pathname.includes('/git/ref/tags/')) return Response.json({ ref: `refs/tags/v${pkg.version}` });
      if (u.pathname.endsWith('/releases') && options.method === 'GET') return Response.json([]);
      if (u.pathname.endsWith('/releases') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        assert.equal(body.draft, true);
        assert.equal(body.prerelease, true);
        return Response.json({
          id: 1,
          upload_url: 'https://uploads.github.com/repos/fixture/studio/releases/1/assets{?name,label}',
          assets: [],
        });
      }
      if (u.hostname === 'uploads.github.com') {
        uploaded.push(u.searchParams.get('name'));
        return Response.json({ id: uploaded.length });
      }
      if (options.method === 'PATCH') {
        assert.deepEqual(uploaded, [`X-Artist-${pkg.version}-Windows-x64.exe`, 'SHA256SUMS.txt']);
        assert.equal(JSON.parse(options.body).draft, false);
        published = true;
        return Response.json({ html_url: 'https://github.com/fixture/studio/releases/tag/test' });
      }
      throw new Error('Unexpected request');
    };
    await import('./publish-release.mjs');
    assert.equal(published, true);
  } finally {
    fs.readFile = read;
    fs.access = access;
    globalThis.fetch = network;
    console.log = log;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
