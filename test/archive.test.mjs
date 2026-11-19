import test from 'node:test'
import assert from 'node:assert/strict'
import { importArchive } from '../archive.mjs'

function file(kind, ids, part = 0, folder = 'archive/data') {
  const name = part ? `${kind}-part${part}.js` : `${kind}.js`
  const rows = ids.map(accountId => ({ [kind]: { accountId } }))
  return {
    name, webkitRelativePath: `${folder}/${name}`,
    text: async () => `\ufeffwindow.YTD.${kind}.part${part} = ${JSON.stringify(rows)};\n`
  }
}

test('compares both directions by exact string ID and ignores unrelated files', async () => {
  const next = await importArchive([
    file('following', ['2123456789012345671', '2123456789012345672']),
    file('follower', ['2123456789012345672', '2123456789012345673']),
    { name: 'direct-messages.js', text: () => assert.fail('must not read unrelated files') }
  ])
  assert.equal(next.followingCount, 2)
  assert.equal(next.followerCount, 2)
  assert.deepEqual(next.nonreciprocal.map(account => account.id), ['2123456789012345671'])
  assert.deepEqual(next.notFollowedBackByMe.map(account => account.id), ['2123456789012345673'])
})

test('handles out-of-order parts, duplicate records and an empty list', async () => {
  const next = await importArchive([
    file('following', ['7', '8'], 1),
    file('follower', []),
    file('following', ['6', '7'])
  ])
  assert.equal(next.followingCount, 3)
  assert.equal(next.followerCount, 0)
  assert.deepEqual(next.nonreciprocal.map(account => account.id), ['6', '7', '8'])
})

test('rejects missing files, parts, and mixed archive directories', async () => {
  await assert.rejects(importArchive([file('follower', [])]), /找不到 following/)
  await assert.rejects(importArchive([file('follower', [], 1), file('following', [])]), /分卷/)
  await assert.rejects(importArchive([file('follower', []), file('following', [], 0, 'other/data')]), /多个存档目录/)
})

test('rejects executable input and IDs already rounded by number parsing', async () => {
  const invalid = { name: 'follower.js', text: async () => 'window.YTD.follower.part0 = []; alert(1)' }
  await assert.rejects(importArchive([invalid, file('following', [])]), /数据格式无效/)
  await assert.rejects(importArchive([file('follower', [Number.MAX_SAFE_INTEGER + 1]), file('following', [])]), /有效的账号 ID/)
})
