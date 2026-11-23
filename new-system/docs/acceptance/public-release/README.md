# 公网首发硬化与验收

2026 年 11 月 21 日。本轮使用仅绑定本机回环地址的独立 Compose 实例、临时证书、合成账号和独立数据卷。

## 本机验收

| 项目 | 结果 |
| --- | --- |
| HTTPS 网关 | 实际 HTTP 301，TLS hostname 校验，HSTS 含 `includeSubDomains`，`nosniff`、`DENY`、CSP 均存在。超过 10 MiB 的声明长度返回 413。 |
| 认证 | 生成 5 个单次邀请，拒绝错误邀请码，测试学员通过邀请码注册并登录。刷新 Cookie 含 `Secure`、`HttpOnly`、`SameSite=Lax`。账号锁定跨重启生效，登录和判题限流有接口测试。 |
| 正常 Java 评测 | 提交真实源文件快照，首节在 Docker 执行通过，首节进度可重新读取，进入下一章保留同一份源码。三个本机操作入口均返回 403。 |
| 隔离与超时 | 管理端能看到作业容器运行，普通作业及睡眠超时作业结束后容器均被回收。实际检查 Java 容器 `network=none`、只读根、512 MiB、1 核、64 PID、只读输入和 `/tmp` tmpfs。JDBC 作业读取到 cgroup 的实际 512 MiB、1 核、64 PID 限额，路由表没有外部路由。 |
| SQL 和报告 | 学员创建数据库、建表、插入并查回 42，实际下载现有 Word 兼容 `.doc` 报告。 |
| 管理后台 | 通过 HTTPS 看到新学员，冻结后旧访问令牌返回 401。浏览器执行冻结，学员重新发起认证请求后回到登录页。浏览器用后台重置的临时密码登录，跳转至修改密码页。接口继续完成改密。 |
| SQLite 和清理 | 在线导出主库及 4 个学员库，压缩、解压后通过 SQLite 完整性、外键和归属核对。独立 WAL 数据夹具验证保留期及终态目录清理，保留运行中、有容器挂载、状态未知和未达七天的目录。 |

原始证据在 `new-system/runtime/release-qa/`。关键记录为 `blackbox.json`、`jdbc-cgroup.log`、`restore-verification.log`、`ops-evidence.log` 及三张 `browser-*.png`。

真实 Docker 专项分别通过 Boot JDBC、项目 A 读取、项目 B 登录，以及作品 C 核心和迁移。作品 C 的检查拆成多次限时启动，阶段之间保留同一作业的 MySQL 数据，并继续验证持久化。Linux 容器中的 `maintenance.sh backup` 入口执行成功。验收用 Compose 实例已停机，证据与归档已保留。

首轮 `PublicAccessTest` 的 11 项中有 9 项通过，覆盖弱 JWT 拒绝、账号锁定、登录和评测限流。模拟 SSE 专项复验通过。50 学员库性能测试两轮 p95 分别为 115 ms 和 111 ms，高于既有 100 ms 门槛，仍待目标环境复验。

## 放行状态

公网入口仍须等待目标主机验收。需在目标 Linux 主机验证 rootless Docker、cgroup v2 的 systemd 委派和组合负载，使用正式 DNS 与权威证书验证网关、真实客户端 IP、SSE 和安全组，并安装及手动执行定时备份和清理。恶意逃逸项以隔离参数、实际 cgroup、路由和安全超时作业验证其防线。

当前练习 MySQL 沿用每账户独立容器，由后端按需启动。Compose 中的独立 `mysql-pool` 服务仍待落地。2 GiB 配置关闭常驻练习池，SQL 和课内实战验收使用启用练习池的隔离配置。

正式 DNS、证书、主机运维路径、生产邀请码及种子用户发放需在目标环境完成。操作入口见[生产部署说明](../../../deployment/README.md)。
