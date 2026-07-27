import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const suspiciousPatterns = [
  { name: 'private key material', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'API key assignment', regex: /\bapi[_-]?key\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
  { name: 'client secret assignment', regex: /\bclient[_-]?secret\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
  { name: 'access token assignment', regex: /\baccess[_-]?token\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
  { name: 'refresh token assignment', regex: /\brefresh[_-]?token\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
  { name: 'password assignment', regex: /\b(?:password|passwd)\b\s*[:=]\s*['"][^'"\s]{3,}['"]/i },
  { name: 'connection string assignment', regex: /\bconnectionstring\b\s*[:=]\s*['"][^'"]+['"]/i },
  { name: 'public email address', regex: /[A-Z0-9._%+-]+@(gmail|yahoo|outlook)\.com/i },
  { name: 'SSN-like value', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
]

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)

const findings = []

for (const relativeFile of trackedFiles) {
  const absoluteFile = path.join(repoRoot, relativeFile)
  let content

  try {
    content = readFileSync(absoluteFile, 'utf8')
  } catch {
    continue
  }

  if (content.includes('\u0000')) {
    continue
  }

  const lines = content.split(/\r?\n/)

  lines.forEach((line, index) => {
    suspiciousPatterns.forEach((pattern) => {
      if (pattern.regex.test(line)) {
        findings.push({
          file: relativeFile,
          line: index + 1,
          name: pattern.name,
          content: line.trim(),
        })
      }
    })
  })
}

if (findings.length) {
  console.error('Security scan found suspicious tracked content:')
  findings.forEach((finding) => {
    console.error(`- ${finding.file}:${finding.line} ${finding.name}`)
    console.error(`  ${finding.content}`)
  })
  process.exit(1)
}

console.log(`Security scan passed across ${trackedFiles.length} tracked files.`)
