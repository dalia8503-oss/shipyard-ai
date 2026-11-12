// PreToolUse 훅: labs/현업미션/data-셋째주/ 아래 원본 파일의 변경을 차단한다 (차단 = exit 2 + stderr 사유).
// 대상: Write/Edit/MultiEdit/NotebookEdit(파일 경로 검사), Bash/PowerShell(명령 문자열 휴리스틱 검사).
// 한계: 셸 명령은 문자열 휴리스틱이라 변수로 조립한 경로, 별도 스크립트 파일 안의 쓰기는 잡지 못한다.
import path from 'node:path';

const MSG =
  'labs/현업미션/data-셋째주/ 아래 원본 파일은 수정할 수 없습니다. 보정이 필요하면 보고서에서 처리하고, 원본 수정은 파일 작성자에게 확인하세요.';
const block = (why) => {
  console.error(`block-data-edit: ${MSG}${why ? ` (${why})` : ''}`);
  process.exit(2);
};

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const raw = Buffer.concat(chunks).toString('utf8');

// 보호용 훅이므로 입력이 비었거나 해석되지 않으면 통과시키지 않고 차단한다.
let input;
try {
  input = JSON.parse(raw);
} catch {
  block('훅 입력 JSON을 해석할 수 없음');
}
if (!input || typeof input !== 'object') block('훅 입력이 객체가 아님');

const isWin = process.platform === 'win32';
const norm = (p) => (isWin ? p.toLowerCase() : p);
const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const dataDir = path.join(root, 'labs', '현업미션', 'data-셋째주');

// Windows는 세그먼트 끝의 '.'/공백을 무시하므로 제거한 뒤 비교한다 (data./a.xlsx).
const cleanSegments = (p) =>
  p
    .split(/[\\/]/)
    .map((s) => (s === '.' || s === '..' ? s : s.replace(/[. ]+$/, '')))
    .join(path.sep);

const inDataDir = (target) => {
  const abs = cleanSegments(path.resolve(input.cwd || root, target));
  const rel = path.relative(norm(dataDir), norm(abs));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// --- 1) 파일 경로 도구 -------------------------------------------------
const ti = input.tool_input ?? {};
const filePath = ti.file_path ?? ti.notebook_path;
const READ_ONLY = /^(read|glob|grep|ls|notebookread)$/i;
if (READ_ONLY.test(input.tool_name ?? '')) process.exit(0);
if (typeof filePath === 'string' && filePath) {
  if (inDataDir(filePath)) block(`${input.tool_name}: ${filePath}`);
  process.exit(0);
}

// --- 2) 셸 명령 (Bash / PowerShell) -------------------------------------
const cmd = typeof ti.command === 'string' ? ti.command : '';
if (!cmd) process.exit(0);

// data-셋째주 디렉터리 참조: 단어 경계를 둔다.
const DATA_REF = /(?<![\w.-])data-셋째주(?=[\\/*'"\s)]|$)/i;
const hasData = (s) => DATA_REF.test(s);

// 2>&1, >/dev/null, >$null 같은 무해한 리다이렉트는 제거하고 검사한다.
const cleaned = cmd
  .replace(/\d*>&\d/g, ' ')
  .replace(/\d*>>?\s*(\/dev\/null|\$null|nul)\b/gi, ' ');

const stripQuotes = (t) => t.replace(/^[('"]+|[)'",;]+$/g, '');
const tokensOf = (s) => s.split(/\s+/).filter(Boolean).map(stripQuotes);

// 쓰기 대상 위치가 정해진 동사: 동사 뒤 인자(같은 파이프 구간)만 본다.
const DEST_VERBS = /^(out-file|export-csv|export-clixml|set-content|add-content|tee|tee-object|clear-content)$/i;
// 마지막 인자가 목적지인 동사 (원본에서 복사해 읽는 것은 허용).
const COPY_VERBS = /^(cp|copy|copy-item)$/i;
// 어디에 data가 나오든 위험한 동사/패턴.
const DESTRUCTIVE =
  /(?<![\w-])(rm|rmdir|del|erase|mv|move|move-item|remove-item|ri|rename-item|ren|new-item|ni|touch|truncate|dd|ln|mklink|robocopy|xcopy|attrib|icacls|chmod)(?![\w-])|\bsed\s+(-[a-z]*i|--in-place)|\bperl\s+-[a-z]*i|\bgit\s+(checkout|restore|reset|clean|rm|mv|stash|apply|am|merge|rebase|pull|switch)\b|\.save\(|\.save_as\(|to_csv|to_excel|to_parquet|write_text|write_bytes|shutil\.|os\.(remove|rename|replace|unlink)|\bunlink\(|open\([^)]*['"][^'"]*[wax+][^'"]*['"]|writeFile|appendFile|\[io\.file\]::(write|copy|move|delete)|set-itemproperty/i;

// 문(statement) 단위로 나눈다. ';'는 python -c 코드 안에도 있어 나누지 않는다.
const statements = cleaned.split(/&&|\|\||\r?\n/);

for (const st of statements) {
  // (a) 리다이렉트 대상: > file, >> file
  for (const m of st.matchAll(/(?<![\w<-])\d*>>?\s*["']?([^\s|;&"'<>]+)/g)) {
    if (hasData(m[1]) || inDataDir(m[1])) block(`리다이렉트: ${m[1]}`);
  }

  // (b) 파이프 구간별 검사
  for (const seg of st.split('|')) {
    const toks = tokensOf(seg);
    for (let i = 0; i < toks.length; i++) {
      const verb = toks[i];
      if (DEST_VERBS.test(verb)) {
        const args = toks.slice(i + 1);
        if (args.some((a) => hasData(a))) block(`쓰기 명령: ${verb}`);
      } else if (COPY_VERBS.test(verb)) {
        const args = toks.slice(i + 1).filter((a) => !a.startsWith('-'));
        const dest = toks.findIndex((a) => /^-destination$/i.test(a));
        const target = dest >= 0 ? toks[dest + 1] : args[args.length - 1];
        if (target && hasData(target)) block(`복사 대상: ${target}`);
      }
    }
    if (DESTRUCTIVE.test(seg) && hasData(seg)) block('data-셋째주/ 대상 변경 명령');
  }
}

process.exit(0);
