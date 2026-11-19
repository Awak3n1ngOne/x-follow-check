import { ArchiveError, importArchive } from './archive.mjs'

const byId = id => document.getElementById(id)
const cacheKey = 'archive:lastImport'
const pageSize = 40
const number = new Intl.NumberFormat('zh-CN')
const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
const sections = {
  nonreciprocal: { description: '存档中，你关注了对方，对方没有关注你。', tag: '未回关' },
  notFollowedBackByMe: { description: '存档中，对方关注了你，你没有关注对方。', tag: '粉丝' }
}
const folder = byId('folder')
const files = byId('files')
const query = byId('query')

let snapshot = null
let mode = 'nonreciprocal'
let page = 0
let busy = false

function announce(text, tone = '') {
  const notice = byId('notice')
  notice.dataset.tone = tone
  notice.textContent = text
  notice.hidden = !text
}

function setBusy(value) {
  busy = value
  for (const id of ['select-folder', 'select-files', 'clear']) byId(id).disabled = busy
}

function makeRow(person) {
  const row = document.createElement('li')
  row.className = 'person-row'

  const link = document.createElement('a')
  link.className = 'person'
  link.href = `https://x.com/i/user/${encodeURIComponent(person.id)}`
  link.target = '_blank'
  link.rel = 'noopener noreferrer'

  const titleText = person.name ?? (person.handle ? `@${person.handle}` : `账号 ${person.id}`)
  const avatar = document.createElement('span')
  avatar.className = 'avatar'
  avatar.setAttribute('aria-hidden', 'true')
  avatar.textContent = person.handle?.slice(0, 1).toUpperCase() ?? '#'
  const info = document.createElement('span')
  const name = document.createElement('span')
  name.className = 'person-name'
  const display = document.createElement('span')
  display.textContent = titleText
  name.append(display)
  const meta = document.createElement('span')
  meta.className = 'person-meta'
  if (person.handle && person.name) {
    const handle = document.createElement('span')
    handle.className = 'person-handle'
    handle.textContent = `@${person.handle}`
    meta.append(handle)
  }
  const tag = document.createElement('span')
  tag.className = 'relationship-tag'
  tag.dataset.kind = mode === 'notFollowedBackByMe' ? 'fan' : 'not-following-back'
  tag.textContent = sections[mode].tag
  meta.append(tag)
  info.append(name, meta)
  const arrow = document.createElement('span')
  arrow.className = 'row-arrow'
  arrow.setAttribute('aria-hidden', 'true')
  arrow.textContent = '↗'
  link.append(avatar, info, arrow)
  row.append(link)
  return row
}

function render() {
  byId('following-count').textContent = snapshot ? number.format(snapshot.followingCount) : '—'
  byId('follower-count').textContent = snapshot ? number.format(snapshot.followerCount) : '—'
  byId('imported-at').textContent = snapshot
    ? `本地已保存 · 导入于 ${date.format(new Date(snapshot.importedAt))}`
    : '请选择解压后的 data 文件夹'
  byId('clear').hidden = !snapshot
  byId('explanation').textContent = sections[mode].description
  for (const kind of Object.keys(sections)) {
    byId(kind).setAttribute('aria-pressed', String(kind === mode))
    byId(`${kind}-count`).textContent = snapshot ? number.format(snapshot[kind].length) : '—'
  }

  const records = snapshot?.[mode] ?? []
  const term = query.value.trim().replace(/^@/, '').toLowerCase()
  const filtered = records.filter(person => [person.id, person.handle, person.name]
    .some(value => value?.toLowerCase().includes(term)))
  const pages = Math.ceil(filtered.length / pageSize)
  page = Math.min(page, Math.max(0, pages - 1))
  const shown = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const list = byId('people')
  list.replaceChildren(...shown.map(makeRow))
  list.hidden = !shown.length
  const empty = byId('empty')
  empty.hidden = Boolean(shown.length)
  empty.textContent = !snapshot
    ? '导入 X 数据存档后查看名单。也可以同时选择 follower.js 和 following.js。'
    : records.length ? '没有符合搜索条件的账号。' : '这张名单是空的。'
  byId('pagination').hidden = pages < 2
  byId('prev').disabled = page === 0
  byId('next').disabled = page >= pages - 1
  byId('page').textContent = `${page + 1} / ${pages} 页 · ${number.format(filtered.length)} 个`
}

async function handleImport(input) {
  const selected = Array.from(input.files)
  input.value = ''
  if (!selected.length || busy) return
  setBusy(true)
  announce('正在本机读取存档…')
  try {
    const next = await importArchive(selected)
    await chrome.storage.local.set({ [cacheKey]: next })
    snapshot = next
    page = 0
    query.value = ''
    render()
    announce('已导入，两张名单已保存到本机。')
  } catch (error) {
    announce(error instanceof ArchiveError ? error.message : '无法保存这次导入。请检查浏览器存储空间。', 'error')
  } finally {
    setBusy(false)
  }
}

byId('select-folder').addEventListener('click', () => folder.click())
byId('select-files').addEventListener('click', () => files.click())
folder.addEventListener('change', () => void handleImport(folder))
files.addEventListener('change', () => void handleImport(files))
for (const kind of Object.keys(sections)) {
  byId(kind).addEventListener('click', () => {
    mode = kind
    page = 0
    render()
  })
}
query.addEventListener('input', () => {
  page = 0
  render()
})
for (const [id, direction] of [['prev', -1], ['next', 1]]) {
  byId(id).addEventListener('click', () => {
    page += direction
    render()
    byId(mode).scrollIntoView({ block: 'start' })
  })
}

byId('clear').addEventListener('click', async () => {
  if (busy || !window.confirm('清除这份本地名单缓存？原始存档文件会保留。')) return
  setBusy(true)
  try {
    await chrome.storage.local.remove(cacheKey)
    snapshot = null
    page = 0
    query.value = ''
    render()
    announce('已清除本地缓存。')
  } catch {
    announce('无法清除缓存，请重试。', 'error')
  } finally {
    setBusy(false)
  }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[cacheKey]) return
  snapshot = changes[cacheKey].newValue ?? null
  page = 0
  render()
})

setBusy(true)
chrome.storage.local.get(cacheKey)
  .then(saved => { snapshot = saved[cacheKey] ?? null })
  .catch(() => announce('无法读取缓存，可以重新导入存档。', 'error'))
  .finally(() => {
    render()
    setBusy(false)
  })
