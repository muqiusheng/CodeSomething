# Instabox 两节点互备

2026年11月25日确认，`codesomething` 承担公网业务，`maqibu` 用于备份与手动恢复。下文保留既有归档机制及此前的全站接管演练记录。

前端 0.32.0、后端 0.7.3 的恢复批次存放在 `maqibu` 的 `/data/maqibu-full-release-20261125-0320`。其中包括发布包、可用 `docker load` 导入的双镜像、加密配置与同批 SQLite 归档，全部文件列在 `SHA256SUMS`。恢复演练验证了配置归档、镜像标签及 14 个 SQLite 数据库。

`codesomething` 与 `maqibu` 使用相同的 [归档交换脚本](peer-backup.py)。两边通过对端私有 HTTPS 端口上传归档，使用 Instabox 私有端口令牌和独立的接收密钥。归档以 SHA-256 校验，重复上传同名同内容归档可安全重试，接收端拒绝覆盖同名异内容归档。

- 两边的脚本安装在 `/opt/maqibu-peer-backup`，接收和发送目录位于 `/data/maqibu-peer-backup/incoming` 与 `/data/maqibu-peer-backup/outgoing`。两台分别以 `csdeploy` 和 `user` 运行。
- 在两台机器分别用 `instabox port publish <machine> 17682 --private` 发布备份接收端口。部署 [接收服务](instabox/maqibu-peer-receiver@.service)、[备份任务](instabox/maqibu-peer-backup@.service) 和 [定时器](instabox/maqibu-peer-backup@.timer)。创建权限为 0700 的归档目录，并为各自的服务用户提供权限为 0600 的 `/etc/maqibu-peer-backup/<user>.json`。
- 配置字段为 `bind`、`port`、`data`、`inbox`、`outbox`、`receive_key`、`peer_url`、`peer_token`、`peer_key`，可选 `retention_days`。接收密钥由每站独立生成，为 32 个随机字节的十六进制字符串。发送端使用对端接收密钥和对端端口令牌。服务在宿主内通过 17682 接收，私有端口负责 TLS 和第一层认证。
- 在接收端用 `python3 peer-backup.py restore-check <archive> <new-directory>` 演练恢复。恢复目录必须尚不存在，校验逐库执行。生产自动接收的快照只写入归档目录。
- 两边每小时运行，默认保留 14 天。备用端还没有独立运行的业务库时，备份任务保留入站归档并跳过出站快照。对端冷却时上传可能失败，本地归档保留，下个运行周期会生成并尝试发送新快照。快照覆盖 SQLite 中的账户、会话、邀请码、学习记录、草稿和提交。临时 MySQL 实例按课程重建，报表归档任务可重新发起。

启用顺序为接收服务、双向测试快照、恢复检查、定时器。`systemctl start maqibu-peer-backup@<user>.service` 可立即触发备份。`systemctl list-timers 'maqibu-peer-backup@*'` 与 `journalctl -u maqibu-peer-backup@<user>.service` 用于复查计划时间和结果。

## 全站接管状态

现有公网自动接力覆盖首页与公开资源。登录、注册、管理和学习工作台仍由主站处理。两台 Instabox 的定时归档可用于恢复；其时间点可能早于主站最后一次提交。

全站接管需要一处在任一 Instabox 冷却期间仍可访问的权威业务存储。生产 Java 后端当前按账户路由 SQLite，并依赖 SQLite 的事务和索引通知，因此 PostgreSQL 快照导入通过后仍需验证应用层读写及每个学员的隔离。两端要共用会话签名配置及会话存储。草稿、学习进度、评测结果和报表文件须随业务切换。SQL 持久练习库的快照和恢复也要单独验证。

生产切换验证使用同一测试账号和入口域名，按主站正常、主站不可用、主站恢复三个阶段连续执行。保留登录，在主站写入草稿并读取进度，备用节点读取同一版本并继续保存、判分，主站回切后核对备用节点写入及判题结果。覆盖注册、邀请码、管理权限、报表和断点恢复。在途评测须有唯一的执行与结果提交机制；超时或断连后先确认原提交状态，再决定是否重试。悉尼应用与上海应用为冷备。当前悉尼域名网关继续运行，直到新入口独立验收。

2026年11月24日，使用发布烟测的 V23 测试库在隔离 PostgreSQL 16 上复验 [导入检查](../tooling/checks/check-postgres-snapshot-import.py)。2 个 schema、94 张表、36 个索引记录触发器通过验证。独立连接并发更新单次邀请码和会话撤销标记时各只有一个成功，另一个客户端可读取已提交的源码及作业状态。下一阶段仍需应用层验收和生产数据同步。
