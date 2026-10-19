# 配置与本地数据接口

## API

页面 `load` 事件后可调用：

```js
const result = window.OrbitDemo.setSnapshot(snapshot);
// 成功：{ ok: true }
// 无效：{ ok: false, error: 'INVALID_SNAPSHOT' }，并清除输入、恢复模拟

window.OrbitDemo.useDemo();
window.OrbitDemo.getStatus();
// mode、expiresAt、error、workflowEvents、workflowSignals、音频与动态效果状态
```

只接受普通 JSON 形状的数据；不要传入带 getter、函数或自定义类实例的对象。不会执行数据字符串。所有字段在内存中通过白名单投影；未知字段不进入可视化。

可选适配方式：你自己的可信本地脚本在 `app.js` 之后加载，等待 `load`，转换自己的数据为下面的格式并调用该 API。没有自动发现、自动联网、URL 参数或认证参数，也没有生产后端兼容承诺。

如需了解完整合成样例，可以在本地控制台调用：

```js
const config = OrbitData.validateConfig(ORBIT_CONFIG);
const example = OrbitData.createDemo(config);
OrbitDemo.setSnapshot(example);
```

该样例是即时生成的虚构数据，不是任何实际系统的导出。

## 最小快照

```js
const snapshot = {
  ok: true,
  ts: Date.now() / 1000,
  tick: 2,
  host: {
    cpu: 12, cores: 8,
    mem_used: 2048, mem_total: 8192,
    disk_used: 20, disk_total: 128
  },
  groups: ORBIT_CONFIG.members.map(member => ({
    key: member.key,
    cpu: 1.5, mb: 128, procs: 3, busy: false,
    organs: [{ name: '示例工作单元', n: 1, mb: 64, cpu: 0.5 }]
  }))
};
```

`ok`、`ts`、`host.cpu/cores` 和完整七个 `groups` 为必需字段。`ts` 是 Unix 秒，接收时不得早于当前时间 60 秒或晚于当前时间 5 秒。重复/缺失成员均拒绝。`tick` 为 0.5–60 秒，不改变应用自身的刷新定时器。

| 字段 | 约束与含义 |
|---|---|
| `host.cpu`、`groups[].cpu`、`organs[].cpu` | 数字 0–100，不接受数字字符串、NaN 或 Infinity |
| `host.cores` | 整数 0–1024 |
| `groups[].procs`、`organs[].n` | 整数 0–10000 |
| `groups[].mb`、`organs[].mb` | 0–10⁹；内存单位 MiB |
| `groups[].busy` | 必须为布尔值 |
| `groups[].organs` | 每成员最多 9 项；名称最长 160 字符 |
| 其余主机指标 | 非负数字，不超过 10⁹；未提供时为 0；磁盘单位 GiB、uptime 单位秒 |
| `host.load` | 最多 3 个 0–10000 的数；默认三个 0 |

## 可选模块

未提供的数组为空，未提供的可选指标为 0 或未知，不会调用任何真实数据源补齐。

| 字段 | 结构 / 上限 |
|---|---|
| `activity` | `{ observer: number[], member1: number[], last_input }`；两条曲线各至多 24 个 0–10⁶ 数字 |
| `events` | 至多 24 项 `{ t, unit, msg?, kind }`；kind 为 `rest` 或 `fail`；文本会原样显示 |
| `timers` | 至多 32 项 `{ unit, last, next }`；动画识别 `memberN-heartbeat` 等本地示例类型 |
| `hist` | 至多 90 项 `{ ts, cpu, mem?, rx?, tx?, dr?, dw?, g? }`；`g` 是七个槽位到 CPU 数字的映射；吞吐单位字节/秒 |
| `sent.house.checks` | 至多 40 项 `{ key?, name, detail?, sev }`；sev 为 `ok`、`warn`、`down`；通过数和总数由数组重新计算 |
| `sent.house.notes` | 至多 24 项 `{ t, msg, key? }`；msg 最长 240 字符 |
| `sent.house` 其余 | `rounds` 为 0–10⁹ 整数，`updated` 为时间；`timer` 为 `{ last, next }`；`incident` 可空或为 `{ name?, opened, member4, closed }`，用于示例检查交接 |
| `sent.beacon` | `weekly_used` 为 0–100；可选 `resets_at`、`last_signal`、`x: { next }`，`log` 与 notes 形状相同 |
| `workflow` | 至多 128 项，见下表 |

一般文本最长 160 字符，事件时间显示文本 `t` 最长 40 字符；超限会拒绝整个快照。可选时间接受 Unix 秒、带时区的 ISO 8601 字符串或 null。`activity.last_input` 与 `resets_at` 归一化为 ISO 字符串，信标 `x.next` 归一化为秒。

工作流条目恰好投影为：

```js
{
  event_id: '00000000000000000000000000000001',
  member: 'member1',
  source: 'taskboard',
  stage: 'processing',
  result: 'accepted',
  time: Date.now() / 1000
}
```

`event_id` 为 32 位小写十六进制标识，仅用于事件去重，不是认证令牌。member 为七个固定槽位之一。

| source | 支持的 stage |
|---|---|
| `alarm` | scheduled、invoked、call_finished、failed、cancelled |
| `taskboard` | queued、processing、review、completed、verified、rework、failed、cancelled |
| `shared_task` | queued、processing、blocked、completed |

所有 source 均可发送 `source_status`，result 为 `available` 或 `unavailable`。可见事件需要同一快照内存在相应 source 的近期 available 状态。其他 result 允许 unknown、accepted、success、failure、cancelled；verified 只有 success 才产生验收信号。不适用的 source/stage 组合不会产生可见事件。首次快照建立去重基线，后续新阶段才触发动画；“完成记录”不会被当成“验收通过”。

数据只驻留当前页面。最后一次 `setSnapshot` 后 15 秒到期，在下一个 `config.tickMs` 周期清除；失效前仍可主动 `useDemo()`。无效输入立即清除。切换模式清理日志、排队文本、工作流标记和相关显示，不写浏览器存储。
