"""Import a small, explicit allowlist of user-supplied learning references."""
from pathlib import Path
import hashlib
import json
import shutil
import pymupdf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path('D:/BaiduNetdiskDownload')
DEST = ROOT / 'new-system/frontend/public/materials/tlias'
DEST.mkdir(parents=True, exist_ok=True)
entries = []

def record(source, name, title, **extra):
    target = DEST / name
    shutil.copyfile(source, target)
    entries.append(dict(id=name, title=title, source=str(source), url='/materials/tlias/'+name,
                        sha256=hashlib.sha256(target.read_bytes()).hexdigest(), **extra))

for name, title in [('基础', 'MySQL基础篇'), ('进阶', 'MySQL进阶篇'), ('运维', 'MySQL运维篇')]:
    source = SOURCE / 'mysql' / f'MySQL-{name}篇.pdf'
    pdf = pymupdf.open(source)
    record(source, {'基础':'mysql-basic.pdf','进阶':'mysql-advanced.pdf','运维':'mysql-operations.pdf'}[name],
           title, pages=len(pdf), contents=[dict(title=t[1],page=t[2]) for t in pdf.get_toc() if t[0]==1])

web = SOURCE / 'javaweb+ai'
record(next(web.glob('12.*/资料/02. 接口文档/离线/*.md')), 'api.txt', 'Tlias完整接口文档（含登录）')
record(next(web.glob('11.*/资料/03. 表结构/*.sql')), 'schema.txt', '班级与学员表结构')
record(next(web.glob('13.*/资料/03. Aop案例/日志表.sql')), 'log-schema.txt', '操作日志表结构')

manifest = dict(imported='2026-11-17', scope='用户提供资料，仅当前个人学习站点；对外分享前另行核对材料授权。', files=entries)
(DEST / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
evidence = ROOT / 'new-system/docs/acceptance/local-materials'
evidence.mkdir(parents=True, exist_ok=True)
(evidence / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Imported {len(entries)} selected documents; executable installers, archives and credentials excluded.')
