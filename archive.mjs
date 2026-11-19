const archiveFile = /^(follower|following)(?:[-_]part(\d+))?\.(js|json)$/i
const handlePattern = /^[a-z0-9_]{1,15}$/i
const kinds = ['follower', 'following']

export class ArchiveError extends Error {}

function readPart(file, format, content) {
  const [, rawKind, fileIndex, extension] = format
  const kind = rawKind.toLowerCase()
  const assignment = /^window\.YTD\.(follower|following)\.part(\d+)\s*=\s*/.exec(content)
  if ((extension.toLowerCase() === 'js' && !assignment) || (assignment && assignment[1] !== kind)) {
    throw new ArchiveError(`无法识别 ${file.name}。请选择 X 存档中的原始文件。`)
  }

  const index = Number(assignment?.[2] ?? fileIndex ?? 0)
  if (!Number.isSafeInteger(index)) throw new ArchiveError(`${file.name} 的分卷编号无效。`)

  let rows
  try {
    const json = assignment ? content.slice(assignment[0].length) : content
    rows = JSON.parse(json.replace(/;\s*$/, ''))
  } catch {
    throw new ArchiveError(`${file.name} 的数据格式无效。`)
  }
  if (!Array.isArray(rows)) throw new ArchiveError(`${file.name} 应包含一个账号列表。`)

  const accounts = rows.map((row, position) => {
    const raw = row?.[kind]
    const sourceId = raw?.accountId
    const id = typeof sourceId === 'string' ? sourceId
      : Number.isSafeInteger(sourceId) ? String(sourceId) : ''
    if (!/^[1-9]\d{0,23}$/.test(id)) {
      throw new ArchiveError(`${file.name} 第 ${position + 1} 条缺少有效的账号 ID。`)
    }
    const handle = raw.screenName ?? raw.username
    const name = raw.displayName ?? raw.name
    return {
      id,
      ...(typeof handle === 'string' && handlePattern.test(handle) ? { handle } : {}),
      ...(typeof name === 'string' && name.trim() ? { name: name.trim().slice(0, 120) } : {})
    }
  })
  return { kind, index, accounts }
}

export async function importArchive(files, importedAt = new Date().toISOString()) {
  const matched = Array.from(files, file => ({ file, format: archiveFile.exec(file.name) }))
    .filter(entry => entry.format)
  const folders = new Set(matched
    .map(({ file }) => file.webkitRelativePath?.split('/').slice(0, -1).join('/'))
    .filter(Boolean))
  if (folders.size > 1) {
    throw new ArchiveError('发现多个存档目录。请选择单个存档中的 data 文件夹。')
  }

  // Read only the two file types we need. Their JavaScript wrapper is parsed as data.
  const parts = await Promise.all(matched.map(async ({ file, format }) =>
    readPart(file, format, (await file.text()).trim())
  ))
  const lists = {}
  for (const kind of kinds) {
    const ordered = parts.filter(part => part.kind === kind).sort((a, b) => a.index - b.index)
    if (!ordered.length) {
      throw new ArchiveError(`找不到 ${kind}.js。请选择同一存档里的关注和粉丝文件。`)
    }
    if (ordered.some((part, index) => part.index !== index)) {
      throw new ArchiveError(`${kind} 的分卷有缺失或重复。请选中同一存档的全部分卷。`)
    }

    const accounts = new Map()
    for (const part of ordered) {
      for (const account of part.accounts) {
        accounts.set(account.id, { ...accounts.get(account.id), ...account })
      }
    }
    lists[kind] = accounts
  }

  return {
    importedAt,
    followingCount: lists.following.size,
    followerCount: lists.follower.size,
    nonreciprocal: [...lists.following.values()].filter(account => !lists.follower.has(account.id)),
    notFollowedBackByMe: [...lists.follower.values()].filter(account => !lists.following.has(account.id))
  }
}
