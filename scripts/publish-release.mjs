import fs from 'node:fs/promises';
import path from 'node:path';

// A narrow REST workflow avoids dependence on a runner's gh/git authentication configuration.
const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const tag = process.env.RELEASE_TAG;
try {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !/^v\d+\.\d+\.\d+$/.test(tag || '')) {
    throw new Error('Missing release token, repository or version tag');
  }
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  if (tag !== `v${pkg.version}`) throw new Error('Tag must match package.json version');
  const root = `https://api.github.com/repos/${repository}`;
  async function request(url, method = 'GET', body, binary = false) {
    const result = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'X-Artist-release',
        ...(body ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {}),
      },
      body: body ? (binary ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(180000),
    });
    if (!result.ok)
      throw new Error(`${method} ${new URL(url).pathname}: ${result.status} ${await result.text()}`);
    return result.json();
  }
  await request(`${root}/git/ref/tags/${tag}`);
  const assets = [`release/X-Artist-${pkg.version}-Windows-x64.exe`, 'release/SHA256SUMS.txt'];
  for (const file of assets) await fs.access(file);
  const existing = (await request(`${root}/releases?per_page=100`)).find(
    (release) => release.tag_name === tag,
  );
  if (existing && !existing.draft) throw new Error('This version is already published; create a new version');
  const release =
    existing ||
    (await request(`${root}/releases`, 'POST', {
      tag_name: tag,
      target_commitish: process.env.GITHUB_SHA || 'main',
      name: `X Artist ${tag}`,
      body: await fs.readFile('docs/RELEASE_NOTES.md', 'utf8'),
      draft: true,
      prerelease: true,
    }));
  const upload = new URL(release.upload_url.split('{')[0]);
  if (upload.protocol !== 'https:' || upload.hostname !== 'uploads.github.com')
    throw new Error('Unexpected upload destination');
  for (const file of assets) {
    const name = path.basename(file);
    const previous = release.assets?.find((asset) => asset.name === name);
    // Only replace assets in an unpublished draft owned by this version.
    if (previous) {
      const response = await fetch(`${root}/releases/assets/${previous.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Could not replace draft asset: ${response.status}`);
    }
    upload.searchParams.set('name', name);
    await request(upload.toString(), 'POST', await fs.readFile(file), true);
  }
  const published = await request(`${root}/releases/${release.id}`, 'PATCH', { draft: false });
  console.log(`Published ${published.html_url}`);
} catch (error) {
  const message = String(error.message)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.error(`::error::${message}`);
  process.exitCode = 1;
}
