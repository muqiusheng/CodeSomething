# 码起步 公网部署

公网账户模式使用 Spring Boot 4 和 SQLite V23。前端与 API 走同一 HTTPS 域名。Compose 默认将入口绑定到回环地址。生产实例须由实际运维方提供专用 Linux 主机、DNS 和受信任的 TLS 证书。

## Instabox 主站

2026年11月22日启用免费机器 `codesomething`，当前前端 0.32.0、后端 0.7.3 和 SQLite V23。对外统一使用 [try.maqibu.online 主站](https://try.maqibu.online)。Cloudflare Worker 为公网 HTTPS 入口，直接通过 HTTPS 访问 Instabox 私有端口 17680。Compose 使用生产文件和 `docker-compose.instabox.yml`，后端和MySQL由专用rootless Docker运行。

- 悉尼和上海的备用应用已停止，应用数据库与容器保留供人工恢复。悉尼的 `codesomething-https.socket` 已停用并禁用启动，`codesomething-domain-gateway` 已停止。
- Cloudflare 管理主域名的证书与路由，正式 Worker 的回源凭据位于 Cloudflare Secrets。区域网关配置保留供冷备恢复。
- Instabox 应用端口 17680 为私有，Cloudflare Worker 使用专用端口凭据并保留应用的 Authorization 头。17682 继续承担私有备份。Cloudflare 状态检查使用平台 API。

- 持久目录为 `/data/codesomething`，部署、数据库、快照分别在 `release`、`database`、`backups`。部署账号为 `csdeploy`，私有环境文件为 `release/deployment/site.env`。
- `codesomething-rootless-docker.service` 在专用挂载命名空间内为守护进程提供可用于容器嵌套的 `/proc`，然后以 `csdeploy` 启动 rootless Docker。保留宿主挂载及容器的cgroup v2资源限制。
- Cloudflare Worker `codesomething-instabox-health` 在 UTC 01:00–04:30、06:00–09:30 和 10:30–17:00 每十分钟触发一次，各时段的结束分钟不触发。具体表达式见 [Wrangler 配置](instabox/wrangler.jsonc)。状态检查仅访问 InstaBox 管理 API。主站、判题节点和构建节点分别配置自己的机器 ID 与只读凭据。11 月 26 日三个账户均完成直接 API 读取验证和 Worker 绑定，Worker 定时调用仍出现请求异常。单台是否冷却以管理 API 的实时 `cooldownUntil` 为准。
- 悉尼快照保存在 `backups/sydney-20261122T060017Z.tar.gz`。主站登录使用快照中的账号和密码，已有会话需要重新登录。悉尼应用留在8443，上海 `learn.maqibu.online` 通过SSH隧道私用。两处均可手动接管。需要接续主站最新数据时，恢复同一批次的主库和学员库并撤销旧会话。悉尼接管时先切到支持本站注册的备用网关镜像，再将443的转发目标改回8443。
- 两台备用网关使用 `standby-registration-map.conf` 和 `standby-registration.conf` 将注册入口指向主站并阻断注册、发码写入。启用备用站接管前恢复同批次数据，再切换到支持本站注册的网关镜像。

2026年11月26日，Instabox 主站启用后端 0.8.1、12 个常驻 MySQL 名额及 15 个高峰名额。已有练习实例随正常休眠回收，新实例使用定额卷。前端继续使用 0.34.0，SQLite 保持 V25。

定额磁盘池候选配置为 `CS_PUBLIC_MYSQL_DISK=true`、`CS_PUBLIC_MYSQL_DISK_VOLUME_PREFIX=cs-mysql-slot-codesomething`、`CS_PUBLIC_MYSQL_POOL_LIMIT=12` 和 `CS_PUBLIC_MYSQL_POOL_PEAK=15`。常驻名额用尽时先回收符合空闲条件的实例，全部仍活跃时可借用三个高峰名额。宿主由 `instabox/mysql-quota-slots.sh` 在当前 rootless Docker 的挂载空间内准备固定 384 MiB 卷，后端只分配已验证大小且未被任何容器占用的卷。休眠时先原子保存逻辑快照，再移除容器并归还卷。卷分给另一个学员前清空旧内容。已有磁盘实例在普通停止后重用原卷。

磁盘池最多同时初始化三个 MySQL 容器，名额检查与启动提交在同一临界区内完成。宿主通过 `codesomething-mysql-quota.service` 和对应的 Docker 单元补充配置，在 dedicated daemon 重启后重挂定额文件系统。清理任务保留停止但仍属于学员的 MySQL 容器，避免提前释放含数据的卷。切换候选版本前，主站需留存原 Compose、运行参数及镜像，并在 `maqibu` 校验同批恢复资产。当前线上版本和配置见实施追踪。

目前 `codesomething` 运行生产版本，上海 ECS 实际恢复后已接手例行备份及手动恢复。旧归档继续保存在 `maqibu`。Java 判题和 MySQL 分别通过了隔离试跑，线上学员仍使用主站执行节点。构建包已经在 `maqibu2` 产出。切换与回滚记录见[节点分工与时段切换记录](../../docs/40-节点分工与时段切换记录.md)。

公开介绍页使用 `index.html`，工作台和账户路由使用 `app.html`。实例环境的 `CS_ALLOW_INDEXING` 默认为 `0`。仅当前承担 `try.maqibu.online` 的 Instabox 主站设为 `1`，请求还须经过域名网关。悉尼备用应用与上海私用应用保持 `0`。网关更新时随镜像一起使用新版双入口构建产物和提供 `GET /api/v1/auth/session` 的后端。

Instabox 主站的必应站长验证文件保存在部署目录的 `BingSiteAuth.xml`。重建主站网关镜像时，从该目录获取原文件并放进镜像的 `/usr/share/nginx/html/BingSiteAuth.xml`。发布后验证主域名该路径返回 XML 且与原件字节一致。此路径允许抓取并继续返回 `noindex`，sitemap 仍只包含首页。

### 单主站与备份

[边缘入口 Worker](instabox/gateway-worker.mjs) 与 [Wrangler 配置](instabox/wrangler.gateway.jsonc) 用于替换悉尼网关。接入 `try.maqibu.online` 前先激活 Cloudflare DNS 区域、核对所有原记录、配置 Worker Secrets `INSTABOX_PORT_TOKEN` 和 `CS_INGRESS_TOKEN`，再通过同域名验证 TLS、窗口外 503、登录、回源和 SQL 判分。2026年11月25日已启用 `try.maqibu.online/*` Worker 路由及 DNS 代理，失败模式为关闭。`try` 的代理 A 记录已使用 Cloudflare 保留占位地址 192.0.2.0，线上配置无悉尼回源。原悉尼 A 记录值留在迁移备份内。2026年11月25日已验证直连回源、学员登录和实验三第 4 题判分，停用悉尼网关后复验三项均通过。

Cloudflare Worker 在北京时间 09:00–12:30、14:00–17:30、18:30–次日 01:00 放行新请求。结束时刻起网关返回带时段说明的 503。在途请求按原有连接收尾。网关与状态 Worker 共用 [服务时段](instabox/service-hours.mjs)。当前备份接收和恢复记录见[备份与恢复说明](peer-backup.md)。

## 2 GiB ECS 试学配置

已知目标设备为上海区域阿里云 ECS，系统为 Alibaba Cloud Linux 3，2 vCPU、2 GiB 内存、40 GiB 系统盘、3 Mbps 峰值带宽。使用 `ecs-2g.env.example` 作为试学模板。API 限额 512 MiB（JVM 堆 128–320 MiB），Nginx 限额 96 MiB，数据库型 Java 作业一次运行一组 Java/MySQL 容器，每个容器上限 512 MiB。此配置关闭常驻 MySQL 练习池及 AI，因此 SQL 和课内实验的隔离库运行功能在该配置下不可用。目标主机需实测系统、Docker 与判题峰值的余量。镜像宜在构建机生成，再导入 ECS，避免在评测运行期间同时编译镜像。

## 备案前私用试学

`docker-compose.private.yml` 叠加生产 Compose 后只发布服务器回环地址 `127.0.0.1:8443`。浏览器通过 SSH 本地转发访问 `https://localhost:8443`，域名和公网 Web 端口保留到正式放行。私用环境继续启用邀请码和 Docker 隔离。

使用 `init-production-env.py --ecs-2g private.env` 生成独立环境文件并填写实际运行目录，设置 `CS_PUBLIC_HOST=localhost`。存放包含 `DNS:localhost` 的专用试用证书和私钥，在预检时用 `CS_PRIVATE_TLS_CA` 指向该证书或其 CA。使用 `sh preflight.sh --private` 核对证书、专用 rootless Docker、资源控制和镜像。通过后，使用生产 Compose 和私用覆盖文件启动项目。设备本地转发使用 `ssh -N -L 127.0.0.1:8443:127.0.0.1:8443` 加已验证的 SSH 主机及凭据。

## 初始化

1. 在专用 Linux 服务主机上启用 rootless Docker 与 cgroup v2 资源控制。只向后端挂载专用 Docker socket。主机目录与后端容器的数据路径必须一致，因为 runner 的 bind mount 由 Docker 守护进程解析。参见 [Docker Rootless](https://docs.docker.com/engine/security/rootless/) 和 [Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)。
2. 创建仅服务账号可访问的数据目录、私有环境文件及备份目录。运行 `python3 init-production-env.py production.env`，2 GiB 环境追加 `--ecs-2g`。脚本将独立生成的 32 字节 JWT 随机种子和高强度管理员密码写入新的 0600 文件。随后填写实际域名和路径，保持 `CS_INVITE_REQUIRED=true` 与回环入口。为正式域名申请权威证书，将证书链和私钥复制到证书目录的 `fullchain.pem`、`privkey.pem`。续期后更新这两个文件并在校验通过后执行 `docker compose exec edge nginx -s reload`。
3. 在同一个专用 Docker 守护进程上准备预检列出的 JDK、MySQL 固定镜像。Boot 基础及生成课程还需要实现分支所对应的 `backend/src/main/resources/runner/boot/image-lock.json` 镜像。使用可信构建产物导入并核对完整镜像 ID。
4. 如有 V16 数据，先停止旧服务并做冷备份，再从备份复制到新数据目录。保留原始备份及两个版本的镜像。使用以下命令校验配置并在回环地址上启动。

```sh
cd new-system/deployment
set -a
. ./production.env
set +a
export DOCKER_HOST="unix://$CS_RUNNER_DOCKER_SOCKET"
sh ./preflight.sh
docker compose --env-file production.env -f docker-compose.prod.yml config -q
docker compose --env-file production.env -f docker-compose.prod.yml up -d --build
```

5. 全新实例使用初始化凭据登录 `admin`。迁移已有主库时，使用获授权的现有会话或测试账号验收。创建 5–10 个限次、有时效的邀请码，凭正式域名和证书完成注册、刷新、权限、判题、备份及恢复彩排。初始管理员密码仅在第一次初始化时使用，完成后可从环境文件移除。验收通过后，按实际入口设置 `CS_BIND_ADDRESS` 或上游反代。云安全组与防火墙仅向公众开放 TCP 80/443，保留独立管理通道。开通前从外部核对 HTTPS、HTTP 301、DNS A 记录及 5188/3306 未发布。

## 学习数据与评测

- `codesomething.db` 保存账号、审计、邀请码、会话及初始管理员学习数据。新增用户首次使用学习功能时，创建 `learners/<用户 UUID>.db`。分库沿用原业务表及唯一约束，V17 用文件内 `learning_data_owner` 标记归属。所有库采用 WAL 与 5 秒写锁等待。
- 生产注册默认要求邀请码。访问令牌有效期 2 小时，刷新 Cookie 有效期 14 天并轮换，冻结、退出和密码重置会撤销对应会话。公网禁用本机 IDE、目录配对和宿主机评测。
- 公网 HTTP、Boot、项目 A/B 及独立作品使用隔离评测。全部公开 Java 作业显式使用 `--network=none`。数据库型评测的专用 MySQL 只加入当前 Java 作业的回环命名空间。Maven 离线使用固定镜像。编译和每次启动 Java 应用分别计时，公共期限最多 30 秒，超过期限进入强制容器清理。
- MySQL 练习按账户隔离，常驻池通过 `CS_PUBLIC_MYSQL_POOL_LIMIT` 调整，最大 8 个运行实例。后端按账户按需调度独立 MySQL 容器。SQL 执行、调试与判分期间保护对应实例，浏览器内的答题操作会刷新活跃时间，前台限时模考在倒计时期间也会续期。连续 30 分钟无活动的实例可由后台检查或新请求按最久未用顺序回收。保存到数据目录下的 `mysql-idle/` 的快照可恢复练习数据库及其中的表、视图和存储程序。快照失败时保留实例。所有实例都活跃时，新请求会提示稍后重试。草稿、判分报告和学习进度存储在 SQLite。
- V18 题库在管理端创建、发布、编辑和归档补充选择题。学员从复习页查看已发布内容，提交后展示解析。
- 公网 AI 默认关闭。真实启用需要能运行已授权 App Server 的服务镜像、凭据隔离和受控出站网络。配置完成后设置 `CS_PUBLIC_TUTOR_ENABLED=true`，再从管理端测试连接与学员 SSE。默认 Compose 的 API 网络为内部网络，启用开关本身不会提供出站连接。

## 备份与恢复

Python 3 运维脚本对主库和 `learners/` 逐库执行 `VACUUM INTO`，校验数据库和外键后原子发布 `codesomething-<UTC 时间戳>.tar.gz`。每库取得独立的一致快照。跨库严格同一时间点的恢复点在停写窗口创建。启动预检核验 Python 链接的 SQLite 版本至少为 3.27。运行账号须能访问对应 WAL/SHM 文件并能在 SQLite 数据目录创建共享内存索引。参见 [SQLite VACUUM INTO](https://sqlite.org/lang_vacuum.html)。

安装前把 `maintenance.env.example` 复制到 `/srv/codesomething/maintenance.env`，填写路径并设为 0600。目标机需提供 cron 和 util-linux 的 `flock`。先以专用部署账号手动执行下列命令，核对归档、数据内容及范围，再将 `maintenance.cron.example` 中两行加入同一账号的 crontab。每日 03:00 备份、04:30 清理，按主机时区运行。两个任务分别通过 `flock` 防重入。归档默认保留 14 天，支持配置为 7–14 天。

```sh
. /srv/codesomething/maintenance.env
sh ./maintenance.sh backup
sh ./maintenance.sh cleanup
```

配置 `CS_BACKUP_RCLONE_DESTINATION` 可将压缩归档复制到已配置的 OSS 或 COS 私有存储。上传失败会保留本次归档并返回错误，下一次任务重试尚在本机的归档。远端保留期使用对象存储自己的生命周期规则。

宿主 Python 的 SQLite 版本较旧时，可为预检和运维环境配置 `CS_BACKUP_SQLITE_IMAGE`，值为已导入专用 rootless Docker daemon 的可信 Python 镜像 ID。备份通过无网络、只读根文件系统的临时容器运行。对象存储同步使用宿主 Python 模式。

清理任务连接专用 rootless daemon，只清理超过七天且带本站部署标识的已停止容器、带部署镜像标签的悬空镜像，以及数据库中确认终态、未被 Docker 挂载的作业临时目录。保留对应的 SQLite 源码快照、评测报告和学习进度。

恢复时停止后端，将当前数据目录改名归档，在新的数据路径解压同一批次的主库和 `learners/`，校验后启动。公网快照恢复后旋转 JWT 密钥，并在停机窗口将 `user_tokens.revoked` 全部更新为 1，要求用户重新登录。回退到 V16 时恢复升级前的冷备份和旧后端版本。

### Instabox 两节点互备

部署、定时任务和恢复验收见[两节点互备](peer-backup.md)。
