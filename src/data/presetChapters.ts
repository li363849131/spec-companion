import { ChapterAnalysis } from '../types';

export const PRESET_CHAPTER_ANALYSES: Record<string, ChapterAnalysis> = {
  // PCIe 5.0 iATU Chapter Analysis
  'pcie_5_0_iatu_c1': {
    id: 'user_user_jerry_pcie_5_0_iatu_ch_c1_v1',
    docId: 'pcie_5_0_iatu',
    chapterId: 'c1',
    chapterTitle: 'Chapter 3: Transaction Layer Architecture (P1-P4)',
    startPage: 1,
    endPage: 4,
    markdownContent: `## 🏛️ 章节全局定位与设计初衷（Architectural Motivation）

PCIe 事务层（Transaction Layer）是连接 CPU 片上总线（如 AXI / CHI）与板级高速 SerDes 互联的灵魂中枢。
在现代 SoC 系统中，存在天然的**地址域鸿沟**：
- **CPU Host 物理地址域（HPA）**：CPU 寻址范围通常由片上 MMU/SMMU 控制，受物理引脚与 DDR 布局限制（如 0x8000_0000 起始）。
- **PCIe 总线地址域（PCIe Bus Address）**：Endpoint 设备（如 NVMe SSD、GPU、网络加速卡）暴露的是 BAR 空间（Base Address Register），遵循 PCIe 拓扑编号（BDF: Bus/Device/Function）。

如果不设计地址转换单元（iATU: Internal Address Translation Unit），CPU 就无法通过常规的 C 语言指针内存解引用（\`*ptr = val\`）去自由访问 64 位 PCIe 空间的任何外设寄存器，或者需要复杂且缓慢的中断交互。**iATU 的诞生就是为了在硬件控制器内部实现纳秒级片上 AXI 地址与 PCIe TLP 报文的透明重映射**。

---

## 🔄 核心状态机与协议报文格式（State Machine & TLP Formatting）

### 1. TLP 报文核心生成流程
当片上 CPU 发起一次往外设 BAR 的写入时，控制器状态机经历以下微架构阶段：
1. **AXI 事务采样**：检测到 AXI AWVALID & AWREADY 握手，捕捉到目标物理地址（如 \`0x8000_0000\`）。
2. **iATU Region 命中匹配**：将 AXI 地址与 Outbound Region 0~15 的 \`LOWER_BASE\` 和 \`LIMIT\` 进行窗口包含性判定。
3. **TLP Header 组包**：
   - 提取 \`TARGET_LOWER_ADDR\` 并加上 offset，生成目标 PCIe 地址 \`0x4000_0000_0000\`。
   - 插入 TLP Type：\`MemWr64\` (0x60) 或 \`MemRd64\` (0x20)。
   - 附带 Traffic Class (TC0~TC7) 及 Relaxed Ordering (RO) 属性。
4. **Link Flow Control 仲裁**：检查对端接收缓冲区的 Credit（Posted Credit），获得许可后发送至 Data Link Layer 并附加 LCRC 与序列号。

---

## ⚙️ 关键寄存器位域与配置映射（Registers, Bitfields & Side Effects）

以主流 Synopsys DesignWare PCIe Controller iATU 寄存器组为例：

| 寄存器偏移 (Offset) | 寄存器名称 | 核心位域 (Bits) | 读写属性 | 硬件工程行为与副作用 |
| :--- | :--- | :--- | :--- | :--- |
| \`0x00\` | \`IATU_VIEWPORT\` | \`[3:0] REGION_INDEX\`<br>\`[31] REGION_DIR\` | R/W | **必须优先写入！** 设定当前配置哪一个窗口。Bit[31]=0 为 Outbound，1 为 Inbound。 |
| \`0x04\` | \`IATU_CTRL1\` | \`[4:0] TYPE\`<br>\`[13] TD\` | R/W | 设定生成的 TLP 类型。\`0x0\`=Mem, \`0x2\`=IO, \`0x4\`=Cfg0, \`0x5\`=Cfg1。 |
| \`0x08\` | \`IATU_CTRL2\` | \`[31] REGION_EN\` | R/W | **使能开关**。写 1 立即激活地址转换。必须在基地址和目标地址配置完成后最后置位！ |
| \`0x0C / 0x10\` | \`LOWER_BASE / UPPER_BASE\` | \`[31:0]\` | R/W | 片上 CPU Physical Address 窗口的下边界（4KB 对齐）。 |
| \`0x14\` | \`LIMIT_ADDR\` | \`[31:0]\` | R/W | 窗口上边界。超出此地址范围的访问将不会触发 iATU 转换，导致 AXI DECERR。 |
| \`0x18 / 0x1C\` | \`TARGET_LOWER / UPPER\` | \`[31:0]\` | R/W | 转换后生成的 PCIe 64 位总线目标地址。 |

> ⚠️ **关键位域副作用**：\`IATU_CTRL2[31]\` 未使能前，CPU 对该窗口的读访问会直接触发片上总线无响应异常（Synchronous External Abort / Bus Fault）！

---

## 🐧 Linux 内核驱动实战与落地代码（Linux Kernel Drivers & C Snippet）

在主流 Linux 内核原生驱动 \`drivers/pci/controller/dwc/pcie-designware.c\` 中，配置 Outbound iATU 的标准实现如下：

\`\`\`c
#include <linux/pci.h>
#include <linux/io.h>

// Synopsys DWC iATU 硬件配置例程
void dw_pcie_prog_outbound_atu(void __iomem *dbi_base, int index, int type,
                               u64 cpu_addr, u64 pci_addr, u64 size)
{
    // 1. 切换 Viewport 窗口索引与方向 (Outbound)
    writel(index & 0xf, dbi_base + 0x900); // PCIE_ATU_VIEWPORT

    // 2. 写入 CPU 端起始物理基地址 (64-bit)
    writel(lower_32_bits(cpu_addr), dbi_base + 0x90C);
    writel(upper_32_bits(cpu_addr), dbi_base + 0x910);

    // 3. 设定窗口上边界 (4KB 颗粒度)
    writel(lower_32_bits(cpu_addr + size - 1), dbi_base + 0x914);

    // 4. 写入映射的目标 PCIe 总线地址
    writel(lower_32_bits(pci_addr), dbi_base + 0x918);
    writel(upper_32_bits(pci_addr), dbi_base + 0x91C);

    // 5. 设定 TLP 类型 (如 0=Memory, 4=Cfg0, 5=Cfg1)
    writel(type, dbi_base + 0x904);

    // 6. 使能 Region 映射 (Bit 31 = 1)
    writel(0x80000000, dbi_base + 0x908);

    // 硬件读回以冲刷写缓冲（Flush Pipeline Barrier）
    readl(dbi_base + 0x908);
}
\`\`\`

---

## ⚠️ 流片避坑指南与常见 Errata（Hardware Errata & Pitfalls）

1. **4KB Boundary 跨界致命 Bug**：
   - PCIe 协议严格禁止一个 Memory Read/Write TLP 跨越 **4KB 物理地址边界**。
   - 若上层 DMA 引擎发起一次 256 字节传输，起始地址为 \`0x...0F80\`，则后 128 字节会跨界，导致接收端 Root Port 丢弃报文并上报 \`Unsupported Request (UR)\`。
   - **对策**：驱动必须在分发 DMA 描述符前，对跨 4KB 边界的数据块做 Scatter-Gather 切分。

2. **写后读保序死锁（Write-Posted Deadlock）**：
   - PCIe 内存写是 Posted（不等待 ACK），读是 Non-Posted（等待 Completion）。
   - 若驱动先配置寄存器写触发硬件 DMA，紧接着没有做总线 Barrier 就执行读校验，可能会由于片上 Crossbar 乱序重排导致未生效读，引发严重时序竞态。
`,
    promptVersion: 'v1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hitCount: 5,
    userId: 'user_jerry',
  },

  // ARM AXI5 Spec Chapter Analysis
  'arm_axi5_spec_c1': {
    id: 'user_user_jerry_arm_axi5_spec_ch_c1_v1',
    docId: 'arm_axi5_spec',
    chapterId: 'c1',
    chapterTitle: 'Chapter A3: Single-Copy Atomicity & Cache Stashing (P1-P3)',
    startPage: 1,
    endPage: 3,
    markdownContent: `## 🏛️ 章节全局定位与设计初衷（Architectural Motivation）

ARM AMBA AXI5 是高性能片上互连（SoC Interconnect）的技术标杆。
随着服务器级异构芯片与 AI NPU 的兴起，传统 AXI4 暴露出严重性能瓶颈：
- **无原子事务支持**：传统原子操作必须依赖专用的 Exclusive 监视器或经过重型的锁总线信号，跨核或跨芯片时延迟极高。
- **Cache Pollution（缓存污染）**：传统 DMA 外设直接往主内存写入数据，CPU 核心随后再从高延迟 DDR 中拉取数据，产生严重的 Cache Miss 与带宽浪费。

AXI5 引入了 **Near-Atomic 操作** 与 **Cache Stashing（定向缓存投递）**，允许加速卡或 PCIe 网卡在产生数据的第一时间，直接通过 AXI5 总线把数据投递到目标 CPU 核的 L2/L3 Cache 中，极大缩减端到端处理时延！

---

## 🔄 核心状态机与协议报文格式（State Machine & Stashing Signals）

### 1. AXI5 Cache Stashing 握手机制
在 AW 通道上，AXI5 扩展了专用信号组：
- \`AWSTASH_NID[10:0]\`：指定目标 Node ID（具体哪个 CPU Core 的私有 L2/L3）。
- \`AWSTASH_LPID[4:0]\`：指定目标 Logical Processor ID（超线程/多核分支）。
- \`AWSTASH_VALID\`：指示本次写事务具备定向 Cache 注入属性。

当 Interconnect（如 CMN-700）接收到该事务时，它不再将数据仅写入 SLC，而是同时向目标核发送 Stash Snoop，并在 CPU 核 Cache 中预先分配 Cacheline。

---

## ⚙️ 关键寄存器与位域映射（Registers & Bitfields）

| 信号/寄存器 | 位宽 | 含义与硬件副作用 |
| :--- | :--- | :--- |
| \`AWATOMIC[5:0]\` | 6-bit | AXI5 原子操作码：\`000001\`=Load-Add, \`000010\`=Load-Clr, \`000011\`=Load-Set, \`001000\`=Compare-and-Swap。 |
| \`AWCACHE[3:0]\` | 4-bit | Bufferable, Modifiable, Read-Allocate, Write-Allocate 属性。 |
| \`AWDOMAIN[1:0]\` | 2-bit | 一致性域（00=Non-shareable, 01=Inner Shareable, 10=Outer Shareable, 11=System）。 |

---

## 🐧 Linux 内核驱动实战（Linux SMMU & DMA Integration）

在 ARM64 Linux 驱动中，网卡接收驱动使用 Stash 特性时配置如下：

\`\`\`c
// 在网卡驱动初始化 DMA Ring Buffer 时指定 Cache Stash 属性
static void setup_rx_desc_stashing(struct my_net_device *dev, u32 target_cpu_node)
{
    // 配置芯片私有 PCIe-AXI 桥控制器 Stash 目标 Core ID
    writel(target_cpu_node, dev->bridge_regs + REG_AXI5_STASH_NID);
    writel(ENABLE_STASHING_BIT, dev->bridge_regs + REG_AXI5_STASH_CTRL);
    
    dev_info(dev->dev, "DMA Rx Stashing enabled targeting CPU node: %u\\n", target_cpu_node);
}
\`\`\`
`,
    promptVersion: 'v1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hitCount: 3,
    userId: 'user_jerry',
  },
};
