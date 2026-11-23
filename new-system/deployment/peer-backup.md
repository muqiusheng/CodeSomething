# Instabox 两节点互备

`codesomething` 与 `maqibu` 使用相同的 [归档交换脚本](peer-backup.py)。两边通过对端私有 HTTPS 端口上传归档，使用 Instabox 私有端口令牌和独立的接收密钥。归档以 SHA-256 校验，重复上传同名同内容归档可安全重试，接收端拒绝覆盖同名异内容归档。

- 两边的脚本安装在 `/opt/maqibu-peer-backup`，接收和发送目录位于 `/data/maqibu-peer-backup/incoming` 与 `/data/maqibu-peer-backup/outgoing`。两台分别以 `csdeploy` 和 `user` 运行。
- 在两台机器分别用 `instabox port publish <machine> 17682 --private` 发布备份接收端口。部署 [接收服务](instabox/maqibu-peer-receiver@.service)、[备份任务](instabox/maqibu-peer-backup@.service) 和 [定时器](instabox/maqibu-peer-backup@.timer)。创建权限为 0700 的归档目录，并为各自的服务用户提供权限为 0600 的 `/etc/maqibu-peer-backup/<user>.json`。
- 配置字段为 `bind`、`port`、`data`、`inbox`、`outbox`、`receive_key`、`peer_url`、`peer_token`、`peer_key`，可选 `retention_days`。接收密钥由每站独立生成，为 32 个随机字节的十六进制字符串。发送端使用对端接收密钥和对端端口令牌。服务在宿主内通过 17682 接收，私有端口负责 TLS 和第一层认证。
- 在接收端用 `python3 peer-backup.py restore-check <archive> <new-directory>` 演练恢复。恢复目录必须尚不存在，校验逐库执行。生产自动接收的快照只写入归档目录。
- 两边每小时运行，默认保留 14 天。备用端还没有独立运行的业务库时，备份任务保留入站归档并跳过出站快照。对端冷却时上传可能失败，本地归档保留，下个运行周期会生成并尝试发送新快照。快照覆盖 SQLite 中的账户、会话、邀请码、学习记录、草稿和提交。临时 MySQL 实例按课程重建，报表归档任务可重新发起。

启用顺序为接收服务、双向测试快照、恢复检查、定时器。`systemctl start maqibu-peer-backup@<user>.service` 可立即触发备份。`systemctl list-timers 'maqibu-peer-backup@*'` 与 `journalctl -u maqibu-peer-backup@<user>.service` 用于复查计划时间和结果。

全站自动接管要求两端应用读写同一业务数据库，并在切换时只由一个节点负责处理在途判题。共享数据库迁移先在隔离环境中运行 [导入检查](../tooling/checks/check-postgres-snapshot-import.py)，然后验证原登录会话、邀请码和学习数据可跨节点连续使用。现有公网自动接力覆盖首页与公开资源。登录、注册与工作台仍由主站处理。
