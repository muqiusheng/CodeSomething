# 码起步 公网部署

公网账户模式使用Spring Boot 4 和 SQLite V22。前端与 API 走同一 HTTPS 域名。Compose 默认将入口绑定到回环地址。生产实例须由实际运维方提供专用 Linux 主机、DNS 和受信任的 TLS 证书。

## Instabox 主站

2026年11月22日启用免费机器 `codesomething`，当前前端0.30.5、后端0.6.2和SQLite V22。对外统一使用 [try.maqibu.online 主站](https://try.maqibu.online)。悉尼网关使用现有域名证书，并通过校验证书的 HTTPS 到达 Instabox 公开端口17680。Compose 使用生产文件和 `docker-compose.instabox.yml`，后端和MySQL由专用rootless Docker运行。

- 悉尼 `codesomething-https.socket` 通过 `20-instabox-primary.conf` 把443交给本机8444的 `codesomething-domain-gateway`。8443上的悉尼应用仍使用自己的数据库，上海应用通过原SSH隧道访问。此拓扑下自定义域名入口依赖悉尼 HTTPS 网关。
- 网关使用 `instabox/domain-gateway.conf`。私有网关凭据分别在悉尼网关环境文件和 Instabox `site.env` 保存。域名续签后，同时重载悉尼公开网关与备用应用网关。
- Instabox 的原公开 URL 将页面导航跳到 `try.maqibu.online`，保留路径、查询字符串和邀请片段。Cloudflare Worker 继续使用原公开 URL 的健康端点。

- 持久目录为 `/data/codesomething`，部署、数据库、快照分别在 `release`、`database`、`backups`。部署账号为 `csdeploy`，私有环境文件为 `release/deployment/site.env`。
- `codesomething-rootless-docker.service` 在专用挂载命名空间内为守护进程提供可用于容器嵌套的 `/proc`，然后以 `csdeploy` 启动 rootless Docker。保留宿主挂载及容器的cgroup v2资源限制。
- 使用 `instabox/worker.mjs` 部署Cloudflare Worker `codesomething-instabox-health`，将 `HEALTH_URL` 配为主站 `/api/v1/health`，Cron为 `*/10 * * * *`。Worker由Cron调用，使用方访问Instabox站点。免费档的单次运行上限和冷却期按[Instabox官方规则](https://instabox.sh/docs/idle-suspend.md)执行。
- 悉尼快照保存在 `backups/sydney-20261122T060017Z.tar.gz`。主站登录使用快照中的账号和密码，已有会话需要重新登录。悉尼应用留在8443，上海 `learn.maqibu.online` 通过SSH隧道私用。两处均可手动接管。需要接续主站最新数据时，恢复同一批次的主库和学员库并撤销旧会话。悉尼接管时先切到支持本站注册的备用网关镜像，再将443的转发目标改回8443。
- 两台备用网关使用 `standby-registration-map.conf` 和 `standby-registration.conf` 将注册入口指向主站并阻断注册、发码写入。启用备用站接管前恢复同批次数据，再切换到支持本站注册的网关镜像。

生产应用更新同期发布到 Instabox、悉尼和上海。使用同一前端构建产物及后端版本，保留各站入口配置和独立数据库。先验主站域名、注册及登录，再分别核对备用端口、发布版本与注册限制。

公开介绍页使用 `index.html`，工作台和账户路由使用 `app.html`。实例环境的 `CS_ALLOW_INDEXING` 默认为 `0`。仅当前承担 `try.maqibu.online` 的 Instabox 主站设为 `1`，请求还须经过域名网关。悉尼备用应用与上海私用应用保持 `0`。网关更新时随镜像一起使用新版双入口构建产物和提供 `GET /api/v1/auth/session` 的后端。

Instabox 主站的必应站长验证文件保存在部署目录的 `BingSiteAuth.xml`。重建主站网关镜像时，从该目录获取原文件并放进镜像的 `/usr/share/nginx/html/BingSiteAuth.xml`。发布后验证主域名该路径返回 XML 且与原件字节一致。此路径允许抓取并继续返回 `noindex`，sitemap 仍只包含首页。

### 公开首页自动接力

悉尼公网网关已接入独立的 Instabox 备用机 `maqibu`。仅公开首页、落地页资源、robots、sitemap 和必应验证文件在主站返回 409、502、503 或 504 时转发到备用机。每个请求先尝试主站，因此主站恢复后自动回切。登录、注册、学习工作台与 API 继续走主站。公开首页保留原网址和索引规则，备用源站保持私有端口。

备用机上的 `maqibu-standby.service` 只提供 `/data/maqibu-standby/site` 内的静态文件，并随系统启动。发布介绍页时，同步更新该目录中的生产版 HTML、入口实际引用的资源、favicon、主题脚本、robots、sitemap 与必应验证文件，重启服务后复验。私有端口凭据仅保存在悉尼网关部署环境。备用机无单独定时唤醒，实际接力请求触发唤醒。

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
- MySQL 练习按账户隔离，常驻池通过 `CS_PUBLIC_MYSQL_POOL_LIMIT` 调整，最大 8 个运行实例。目前由后端按账户按需调度独立 MySQL 容器。数据库文件在限容临时盘中，容器停止或回收后从课程初始数据重建。SQL 草稿、检查报告和通关记录在 SQLite 保留。
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
