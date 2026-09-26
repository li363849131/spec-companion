import { PresetSpec } from '../types';

export const PRESET_SPECS: PresetSpec[] = [
  {
    id: 'pcie_5_0_iatu',
    name: 'PCIe 5.0 Base Spec',
    fullName: 'PCI Express® Base Specification Revision 5.0 Version 1.0',
    category: 'pcie',
    version: '5.0-v1.0',
    totalPages: 4,
    outline: [
      { id: 'c1', title: 'Chapter 3: Transaction Layer Architecture', pageNumber: 1, level: 1 },
      { id: 'c2', title: '3.10 Address Translation Mechanisms', pageNumber: 2, level: 2 },
      { id: 'c3', title: '3.10.5 Internal Address Translation Unit (iATU)', pageNumber: 3, level: 3 },
      { id: 'c4', title: '3.10.5.10 Outbound Memory Region & BAR Routing', pageNumber: 4, level: 4 },
    ],
    pages: [
      {
        pageNum: 1,
        chapterTitle: 'Chapter 3: Transaction Layer Architecture > 3.1 Overview',
        sectionNumber: '3.1',
        pageHeading: 'Transaction Layer Packet (TLP) Routing & Address Domains',
        summary: 'TLP 格式、Memory/IO/Configuration 空间划分与 CPU-PCIe 地址域隔离。',
        text: `3.1 Transaction Layer Overview and Address Domain Isolation

The Transaction Layer is responsible for packet generation and consumption, flow control credit management, and transaction ordering.

In modern SoC architectures, the host processor CPU subsystem operates in the Host Physical Address (HPA) domain, while PCIe Endpoint devices operate within the PCIe Bus Address domain. Memory Read/Write Requests, Configuration Requests (Type 0 and Type 1), and Message TLPs must cross this boundary seamlessly.

Root Complex (RC) implementations commonly incorporate dedicated hardware translation blocks (such as Synopsys DesignWare iATU or Cadence PCIe Controller ATU) to transparently remap CPU AXI/AHB memory access windows into outbound TLP requests with arbitrary 64-bit PCIe destination addresses and specific TLP Header attributes (At, T9, TC, TD, EP, Attribute bits).`,
        diagramSvg: `
<svg viewBox="0 0 700 240" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <rect x="20" y="30" width="160" height="180" rx="8" fill="#f8fafc" stroke="#3b82f6" stroke-width="2"/>
  <text x="100" y="60" text-anchor="middle" font-weight="bold" font-size="14" fill="#1e40af">CPU Subsystem</text>
  <rect x="35" y="80" width="130" height="40" rx="4" fill="#e0f2fe" stroke="#0284c7"/>
  <text x="100" y="105" text-anchor="middle" font-size="12" fill="#0369a1">AXI Master Bus</text>
  <text x="100" y="150" text-anchor="middle" font-size="11" fill="#64748b">Host CPU Physical Addr</text>
  <text x="100" y="170" text-anchor="middle" font-size="11" fill="#0f172a" font-family="monospace">0x8000_0000</text>

  <!-- Arrow -->
  <path d="M 180 100 L 260 100" stroke="#0284c7" stroke-width="3" marker-end="url(#arrow)"/>
  
  <rect x="260" y="30" width="180" height="180" rx="8" fill="#f8fafc" stroke="#8b5cf6" stroke-width="2"/>
  <text x="350" y="60" text-anchor="middle" font-weight="bold" font-size="14" fill="#6d28d9">Controller (iATU)</text>
  <rect x="275" y="80" width="150" height="50" rx="4" fill="#ede9fe" stroke="#7c3aed"/>
  <text x="350" y="102" text-anchor="middle" font-size="12" font-weight="600" fill="#5b21b6">Outbound Window 0</text>
  <text x="350" y="120" text-anchor="middle" font-size="10" fill="#6d28d9">Address Translation Matrix</text>
  <text x="350" y="155" text-anchor="middle" font-size="11" fill="#475569">Matches CPU Range:</text>
  <text x="350" y="175" text-anchor="middle" font-size="11" fill="#0f172a" font-family="monospace">Base: 0x8000_0000</text>

  <!-- Arrow -->
  <path d="M 440 100 L 520 100" stroke="#8b5cf6" stroke-width="3"/>

  <rect x="520" y="30" width="160" height="180" rx="8" fill="#f8fafc" stroke="#10b981" stroke-width="2"/>
  <text x="600" y="60" text-anchor="middle" font-weight="bold" font-size="14" fill="#047857">PCIe Fabric / EP</text>
  <rect x="535" y="80" width="130" height="45" rx="4" fill="#d1fae5" stroke="#059669"/>
  <text x="600" y="100" text-anchor="middle" font-size="12" font-weight="600" fill="#065f46">TLP Header Gen</text>
  <text x="600" y="117" text-anchor="middle" font-size="10" fill="#047857">Type: MemWr64 / MemRd64</text>
  <text x="600" y="155" text-anchor="middle" font-size="11" fill="#475569">Target PCIe Addr:</text>
  <text x="600" y="175" text-anchor="middle" font-size="11" fill="#0f172a" font-family="monospace">0x4000_0000_0000</text>
</svg>`,
        tableData: {
          title: 'Table 3-1: PCIe Address Space Mapping Domains',
          headers: ['Domain', 'Originating Master', 'Visibility', 'Alignment Constraints'],
          rows: [
            ['CPU Physical (HPA)', 'ARM Core / x86 Root Port', 'System MMU / Page Table', '4KB / 64KB Page'],
            ['PCIe Outbound Window', 'iATU Translation Engine', 'Hardware Controller Window', 'Window Size aligned (Min 4KB)'],
            ['PCIe Bus Space (DPA)', 'Endpoint Devices / Switches', 'PCIe Link Fabric', 'BAR Size aligned (Up to 64-bit)'],
          ]
        },
        sampleExplanation: `# 3.1 Overview 解读：PCIe 与 CPU 双地址域隔离与 iATU 的诞生

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **TLP (Transaction Layer Packet)**: 事务层报文，PCIe 通信的最核心载体，相当于网络通信中的 IP 报文。所有读写（MemRd/MemWr）、配置（CfgRd/CfgWr）都必须被封装为 12~16 字节的 TLP Header + Payload。
- **HPA 与 Bus Address 冲突**: CPU 发起的是标准总线读写（比如 AXI 或 APB 总线的一条 \`str [x0, #0]\` 汇编指令），只有简单的读写地址与数据，根本没有 TLP 头（没有 Requester ID, Tag, Traffic Class 等元数据）。
- **硬件设计初衷**: 硬件必须在不拖累 CPU 吞吐率的前提下，以纳秒级硬件逻辑自动把 CPU 的内存读写“翻译并组装”成高速串行 PCIe TLP 报文。这正是控制器内部集成 **iATU (Internal Address Translation Unit)** 的核心原因。

---

### 2. 原文逐段精讲与推导（Line-by-Line Breakdown）
- **硬件边界隔离**: 文档第一段强调了 Host 与 PCIe 之间不同的地址空间。CPU 软件视角看到的是 32 位或 48 位系统物理地址空间；而 PCIe Endpoint 上的硬件 BAR（Base Address Register）可能位于高位 64 位总线空间中。
- **iATU 实时地址匹配流转**:
  1. CPU 向已映射好的内存窗口（例如 \`0x8000_0000\`）发起写操作。
  2. 控制器硬件地址解码器（Address Decoder）命中 iATU Outbound Region 0 窗口。
  3. 硬件直接执行偏移减法与重映射：\`PCIe_Target = Target_Base + (CPU_Addr - Base_Addr)\`。
  4. 随后，硬件组装器附加上预配置好的 TLP Type（Memory Write 64-bit），立刻向 PIPE PHY 接口发送 TLP 报文。

---

### 3. 工程实战与驱动场景（Real-world Use Case）
在 Linux 内核 PCIe 控制器驱动中（如 \`drivers/pci/controller/dwc/pcie-designware.c\`），Host 驱动在枚举阶段必须初始化 iATU 窗口，使得内核 \`ioremap()\` 的虚拟地址能直达远端板卡显存或网卡寄存器：

\`\`\`c
/* Linux 内核 dw_pcie_prog_outbound_atu 简化模型 */
static void dw_pcie_prog_outbound_atu(struct dw_pcie *pci, int index,
                                      int type, u64 cpu_addr,
                                      u64 pci_addr, u64 size)
{
    dw_pcie_writel_dbi(pci, IATU_LWR_BASE_ADDR_OFF(index), lower_32_bits(cpu_addr));
    dw_pcie_writel_dbi(pci, IATU_UPPER_BASE_ADDR_OFF(index), upper_32_bits(cpu_addr));
    dw_pcie_writel_dbi(pci, IATU_LIMIT_ADDR_OFF(index), lower_32_bits(cpu_addr + size - 1));
    dw_pcie_writel_dbi(pci, IATU_LWR_TARGET_ADDR_OFF(index), lower_32_bits(pci_addr));
    dw_pcie_writel_dbi(pci, IATU_UPPER_TARGET_ADDR_OFF(index), upper_32_bits(pci_addr));
    dw_pcie_writel_dbi(pci, IATU_CR1_OFF(index), type);
    dw_pcie_writel_dbi(pci, IATU_CR2_OFF(index), IATU_ENABLE | IATU_MATCH_MODE);
}
\`\`\`

---

### 4. 延伸阅读与避坑指南（Notes & Pitfalls）
- **坑点 1：4KB 跨界截断（4KB Crossing Boundary）**: PCIe 规范严禁单个 TLP 跨越 4KB 地址边界！如果 CPU DMA 或软件 memcpy 产生跨界访问，iATU 或上层逻辑必须切分为两个独立 TLP，否则下游 Switch 会触发 \`Malformed TLP (UR/CA)\` 致命错误报死。
- **坑点 2：窗口对齐（Alignment）**: iATU 的 Base 和 Limit 寄存器低 16 位往往固定为只读 0（意味着最小窗口对齐粒度通常是 64KB 或 4KB）。驱动若传入非对齐地址，会导致低位截断，引起可怕的重叠覆盖。`
      },
      {
        pageNum: 2,
        chapterTitle: 'Chapter 3: Transaction Layer Architecture > 3.10 Address Translation',
        sectionNumber: '3.10',
        pageHeading: 'Inbound vs Outbound Translation Architecture',
        summary: '入站与出站转换路径：RC 与 EP 双向通信、MSI-X 报文入站捕获。',
        text: `3.10 Address Translation Mechanisms: Inbound and Outbound Dataflow

The PCIe Controller provides dual-path address translation logic:

1. Outbound Translation (CPU -> PCIe Device):
Invoked when the local CPU initiates transactions towards remote PCIe devices. Typical usages include:
- Memory-Mapped I/O (MMIO) read/write to Endpoint control registers
- Configuration Read/Write (Type 0 for immediate link partner, Type 1 for downstream bridge hierarchy)
- IO space access (legacy)

2. Inbound Translation (PCIe Device -> Host System Memory):
Invoked when remote Endpoints act as Bus Masters to access system RAM:
- DMA Write: EP transfers payload data into system DDR
- DMA Read: EP fetches descriptors or buffers from system DDR
- MSI / MSI-X Interrupt Delivery: Endpoint sends a 32-bit Memory Write TLP targeting the local Interrupt Controller (e.g. ARM GIC-ITS GITS_TRANSLATER or x86 APIC). The Inbound iATU intercepts this address and routes it directly to internal interrupt dispatch logic.`,
        diagramSvg: `
<svg viewBox="0 0 700 220" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <rect x="30" y="20" width="280" height="85" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
  <text x="170" y="45" text-anchor="middle" font-weight="bold" font-size="13" fill="#1e3a8a">OUTBOUND 路径 (CPU -> EP)</text>
  <text x="170" y="65" text-anchor="middle" font-size="11" fill="#3b82f6">CPU 发起 MMIO 访问 / 配置报文</text>
  <text x="170" y="85" text-anchor="middle" font-size="10" font-family="monospace" fill="#475569">CPU AXI -> iATU Outbound -> PCIe TLP</text>

  <rect x="390" y="20" width="280" height="85" rx="6" fill="#f0fdf4" stroke="#10b981" stroke-width="2"/>
  <text x="530" y="45" text-anchor="middle" font-weight="bold" font-size="13" fill="#065f46">INBOUND 路径 (EP -> Host RAM)</text>
  <text x="530" y="65" text-anchor="middle" font-size="11" fill="#059669">DMA 读写宿主机 DDR / MSI-X 中断</text>
  <text x="530" y="85" text-anchor="middle" font-size="10" font-family="monospace" fill="#475569">PCIe TLP -> Inbound BAR Check -> AXI Master</text>

  <!-- BAR Matching Logic -->
  <rect x="200" y="130" width="300" height="70" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="350" y="155" text-anchor="middle" font-weight="600" font-size="12" fill="#334155">Inbound BAR 命中与安全过滤 (SMMU/IOMMU)</text>
  <text x="350" y="175" text-anchor="middle" font-size="11" fill="#64748b">若 TLP 地址落入 BAR0~BAR5 范围，重定向至 Host SoC 物理地址</text>
</svg>`,
        tableData: {
          title: 'Table 3-2: Inbound vs Outbound Translation Attributes',
          headers: ['Parameter', 'Outbound Window', 'Inbound Window'],
          rows: [
            ['Direction', 'Local CPU AXI -> PCIe TLP', 'PCIe Link TLP -> Local AXI Bus'],
            ['Trigger Condition', 'Address matches CPU Memory Window', 'Address matches programmed BAR (0~5)'],
            ['Typical Size', 'Configurable (e.g. 128MB ~ 16GB)', 'Bound to BAR sizing register'],
            ['Latency Impact', '1-2 clock cycles in pipeline', 'Checked concurrently with CRC verification'],
          ]
        },
        sampleExplanation: `# 3.10 Inbound vs Outbound 架构深度剖析

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **Inbound vs Outbound**: 以 PCIe 控制器为中心，出站（Outbound）代表芯片自己主动向外访问外设；入站（Inbound）代表外设（如 NVMe 固态盘、100G 网卡）主动搬移数据进内存。
- **MSI-X 的本质**: 许多新手工程师认为中断是一根拉低的硬件物理铜线，但在 PCIe 中，**MSI/MSI-X 中断完全是一条普通的 32位 Memory Write TLP**！网卡把约定的数据（Vector 号）写进约定的地址（如 GIC ITS 或 x86 LAPIC 地址），控制器 Inbound 单元必须准确识别并将其送入中断控制器。

---

### 2. 原文逐段精讲与推导（Line-by-Line Breakdown）
- **出站路径（Outbound）**:
  当驱动程序执行 \`writel(val, dev->mmio_base + REG_CTRL)\` 时，CPU 产生出站总线事务。iATU 负责填装 TLP 报文头部的 Byte Enables (First BE / Last BE) 以及 64 位目标地址。
- **入站路径（Inbound）与 BAR 绑定**:
  外设发送 DMA 写请求时，控制器入站逻辑首先执行 **BAR 比对**：
  - 如果匹配 BAR0，则根据 Inbound iATU Region 0 配置的目标地址（Target Address）将 PCIe 地址替换为内部 AXI 总线地址，将数据写入主机 DDR；
  - 如果地址未命中任何有效 BAR，控制器硬件直接丢弃（Silent Drop）或上报 \`Unsupported Request (UR)\` 异常，阻止非法设备破坏主机内存。

---

### 3. 工程实战与驱动场景（Real-world Use Case）
在支持 IOMMU / ARM SMMUv3 的现代虚拟化系统中，Inbound 访问必须经过两道关卡：
1. **Controller Inbound iATU / BAR**: 硬件物理级粗粒度过滤；
2. **IOMMU Page Table (DMA Remapping)**: 内核使用 \`dma_alloc_coherent()\` 为外设分配 DMA 缓冲区，并为外设编程 IOVA（I/O Virtual Address）。设备携带的 PCIe Stream ID / BDF（Bus:Device:Function）在 SMMU 中查找 STE（Stream Table Entry），完成虚拟地址向物理页面的安全映射。

---

### 4. 延伸阅读与避坑指南（Notes & Pitfalls）
- **避坑 1：Cache 一致性与 DMA 脏数据**: PCIe Inbound 事务写入 DDR 时，如果 SoC 互联总线不带硬件一致性（如缺少 CCI/CMN 侦听接口），CPU 的 L1/L2 Cache 中若存在该地址的脏数据，后续读取将会读到旧数据！必须在驱动中显式调用 \`dma_sync_single_for_cpu()\` 进行 Cache Invalidation。
- **避坑 2：MSI-X 地址重映射陷阱**: 在定制嵌入式板卡上，若误将 Inbound iATU 窗口覆盖了 SoC 的中断控制器内存段，会导致正常的 DMA 数据被误当成 MSI 中断触发，引发极其难以排查的“幽灵中断”或系统瘫痪。`
      },
      {
        pageNum: 3,
        chapterTitle: 'Chapter 3: Transaction Layer Architecture > 3.10.5 iATU Architecture',
        sectionNumber: '3.10.5',
        pageHeading: 'iATU Register File Architecture: ViewPort vs Unrolled Mode',
        summary: 'iATU 寄存器阵列演进：旧版 Viewport 互斥锁瓶颈与新版 Unrolled 独立寄存器空间。',
        text: `3.10.5 Internal Address Translation Unit (iATU) Register Architecture

To program multiple simultaneous translation windows, PCIe IP designs implement an internal register bank. Two predominant architectural paradigms exist:

1. Legacy ViewPort Mechanism (Indirect Indexing):
A single register (IATU_VIEWPORT_OFF) acts as an index selector. The driver must first write the region index and direction into the ViewPort register, then write to generic target/base registers (IATU_CR1, IATU_LWR_BASE, etc.).
Drawback: Highly vulnerable to race conditions in multi-threaded SMP operating systems. Requires strict spinlock serialization across all CPU cores.

2. Modern Unrolled Mechanism (Direct Addressing):
Each inbound/outbound window is mapped to a dedicated 512-byte contiguous memory offset in the Controller DBI space:
- Region 0 Outbound: Base + 0x000
- Region 1 Outbound: Base + 0x200
- Region 0 Inbound: Base + 0x100
- Region 1 Inbound: Base + 0x300
Eliminates lock contention entirely. Supported by Synopsys DWC Core v4.80a and later.`,
        diagramSvg: `
<svg viewBox="0 0 700 200" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <rect x="20" y="20" width="300" height="160" rx="8" fill="#fff1f2" stroke="#f43f5e" stroke-width="1.5"/>
  <text x="170" y="45" text-anchor="middle" font-weight="bold" font-size="13" fill="#be123c">传统 ViewPort 间接索引模式 (需上锁)</text>
  <rect x="40" y="60" width="260" height="35" rx="4" fill="#ffe4e6" stroke="#fb7185"/>
  <text x="170" y="82" text-anchor="middle" font-size="11" font-family="monospace" fill="#9f1239">IATU_VIEWPORT_OFF = {Dir, Index}</text>
  <rect x="40" y="105" width="260" height="35" rx="4" fill="#ffffff" stroke="#fda4af"/>
  <text x="170" y="127" text-anchor="middle" font-size="11" font-family="monospace" fill="#881337">通用寄存器读写 (易发并发冲突)</text>

  <rect x="360" y="20" width="320" height="160" rx="8" fill="#f0fdf4" stroke="#22c55e" stroke-width="1.5"/>
  <text x="520" y="45" text-anchor="middle" font-weight="bold" font-size="13" fill="#15803d">现代 Unrolled 直接寻址模式 (Lockless)</text>
  <rect x="380" y="60" width="280" height="28" rx="4" fill="#dcfce7" stroke="#4ade80"/>
  <text x="520" y="78" text-anchor="middle" font-size="10" font-family="monospace" fill="#14532d">Region 0: Offset 0x000 (独立 MMIO 空间)</text>
  <rect x="380" y="95" width="280" height="28" rx="4" fill="#dcfce7" stroke="#4ade80"/>
  <text x="520" y="113" text-anchor="middle" font-size="10" font-family="monospace" fill="#14532d">Region 1: Offset 0x200 (独立 MMIO 空间)</text>
  <rect x="380" y="130" width="280" height="28" rx="4" fill="#dcfce7" stroke="#4ade80"/>
  <text x="520" y="148" text-anchor="middle" font-size="10" font-family="monospace" fill="#14532d">Region N: Offset 0x200 * N (多核无锁并发)</text>
</svg>`,
        tableData: {
          title: 'Table 3-3: ViewPort vs Unrolled Comparison',
          headers: ['Metric', 'ViewPort Mode', 'Unrolled Mode'],
          rows: [
            ['Register Footprint', 'Minimal (~64 bytes DBI)', 'Larger (512 bytes per region)'],
            ['Concurrency', 'Requires global spinlock in driver', 'Naturally lock-free per region'],
            ['Linux Driver Support', 'Legacy DWC driver fallback', 'Default dw_pcie_atu_unroll default since Linux 4.10'],
            ['Hardware IP Version', 'DWC < 4.80a', 'DWC >= 4.80a, Enterprise IP'],
          ]
        },
        sampleExplanation: `# 3.10.5 iATU 阵列演进：从 ViewPort 锁竞争到 Unrolled 架构

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **DBI (Data Bus Interface)**: PCIe 控制器内部配置寄存器的总线接口。
- **ViewPort 的性能危机**: 早期芯片为了省硅片面积，所有的出站窗口（例如 16 个 Outbound Regions）共用同一组寄存器。要配置 Region 3，CPU 必须先往 ViewPort 寄存器写入 \`3\`，然后再写基地址。若此时另一个 CPU 核心发生中断并往 ViewPort 写入了 \`1\`，就会将 Region 3 的数据错误写进 Region 1，引发灾难性串扰！

---

### 2. 原文逐段精讲与推导（Line-by-Line Breakdown）
- **Unrolled 模式的物理展开**:
  新规范将每个窗口的配置寄存器直接在地址空间中“展开”（Unroll）。每一个 Region 占用独立的 \`0x200\`（512 字节）地址区间。
  计算公式：
  \`Region_Reg_Addr = DBI_Base + (Index * 0x200) + Reg_Offset\`
  各核驱动完全不需要全局锁，直接计算偏移即可并发配置。

---

### 3. 工程实战与驱动场景（Real-world Use Case）
在 Linux 内核驱动中，初始化代码会先探测控制器是否支持 Unroll 模式：

\`\`\`c
/* drivers/pci/controller/dwc/pcie-designware.c */
static void dw_pcie_iatu_detect_regions(struct dw_pcie *pci)
{
    u32 val;

    /* 尝试读取 Unroll 特性标识寄存器 */
    val = dw_pcie_readl_dbi(pci, PCIE_ATU_VIEWPORT);
    if (val == 0xffffffff) {
        pci->iatu_unroll_enabled = true;
        dev_info(pci->dev, "iATU unroll mode detected, using lockless MMIO access\\n");
    } else {
        pci->iatu_unroll_enabled = false;
        raw_spin_lock_init(&pci->atu_lock);
    }
}
\`\`\`

---

### 4. 延伸阅读与避坑指南（Notes & Pitfalls）
- **避坑：配置生效的延时与硬件握手**: 写入 \`IATU_ENABLE\` 位后，部分工艺较差或跨时钟域的硬件 IP 需要 2~3 个总线时钟周期才能完成状态同步。驱动若在写完使能后立刻发起 MMIO 读写，可能会因为 iATU 尚未就绪而发生总线超时（Bus Abort）。 Linux 驱动中通常会加上 \`readl_poll_timeout()\` 进行状态确认。`
      },
      {
        pageNum: 4,
        chapterTitle: 'Chapter 3: Transaction Layer Architecture > 3.10.5.10 Outbound Memory Region',
        sectionNumber: '3.10.5.10',
        pageHeading: 'Outbound Memory Region Control Registers & Bitfields',
        summary: 'IATU_CR1/CR2 寄存器位域图、Type 字段编码及 32/64 位地址转换。',
        text: `3.10.5.10 Outbound Region Parameter Specification

An Outbound Region is configured through four 32-bit registers (Unrolled mapping):

1. IATU_LWR_BASE_ADDR_OFF (Offset 0x000):
Bits [31:16]: Lower 32 bits of starting CPU system address.
Bits [15:0]: Reserved (Read-only zeros, enforcing 64KB alignment for lower granularity).

2. IATU_UPPER_BASE_ADDR_OFF (Offset 0x004):
Bits [31:0]: Upper 32 bits of starting CPU system address (for 64-bit platforms).

3. IATU_LIMIT_ADDR_OFF (Offset 0x008):
Bits [31:16]: Upper limit address within the CPU space. Any CPU access where LWR_BASE <= Addr <= LIMIT triggers this window.

4. IATU_CTRL1_OFF (Offset 0x00C):
Bit [4:0]: TYPE (TLP Type Encoding)
- 00000b: Memory Read / Write (MemRd / MemWr)
- 00010b: Configuration Type 0 (Direct Link Partner)
- 00011b: Configuration Type 1 (Downstream hierarchy / Bridge)
- 00100b: Message TLP (Interrupt / Vendor Defined Message)
Bit [21]: AT (Address Translation Field: 00b = Untranslated, 01b = Translation Request, 10b = Translated).

5. IATU_CTRL2_OFF (Offset 0x010):
Bit [31]: REGION_ENABLE (1 = Enable translation, 0 = Bypass)
Bit [30]: MATCH_MODE (0 = Address Match, 1 = Bar Match for Inbound)
Bit [28]: CFG_SHIFT_MODE (Used for Type 0/1 config access BDF shifting).`,
        diagramSvg: `
<svg viewBox="0 0 700 180" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <text x="350" y="25" text-anchor="middle" font-weight="bold" font-size="13" fill="#0f172a">IATU_CTRL1_OFF Register (32-Bit Bitfield View)</text>
  
  <!-- Bitfield representation -->
  <g transform="translate(40, 45)">
    <!-- 31:22 Reserved -->
    <rect x="0" y="0" width="180" height="40" fill="#f1f5f9" stroke="#cbd5e1"/>
    <text x="90" y="25" text-anchor="middle" font-size="11" fill="#64748b">[31:22] Reserved</text>

    <!-- 21:20 AT -->
    <rect x="180" y="0" width="70" height="40" fill="#fef3c7" stroke="#f59e0b"/>
    <text x="215" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309">[21:20] AT</text>

    <!-- 19:5 Reserved -->
    <rect x="250" y="0" width="220" height="40" fill="#f1f5f9" stroke="#cbd5e1"/>
    <text x="360" y="25" text-anchor="middle" font-size="11" fill="#64748b">[19:5] Reserved</text>

    <!-- 4:0 TYPE -->
    <rect x="470" y="0" width="150" height="40" fill="#dbeafe" stroke="#3b82f6"/>
    <text x="545" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#1d4ed8">[4:0] TYPE</text>
  </g>

  <!-- Detailed description table below -->
  <g transform="translate(40, 100)">
    <text x="180" y="20" font-size="11" fill="#b45309">AT: Address Translation (ATS 协议位)</text>
    <text x="470" y="20" font-size="11" fill="#1d4ed8">00000b: Mem / 00010b: Cfg0 / 00011b: Cfg1</text>
  </g>
</svg>`,
        tableData: {
          title: 'Table 3-4: IATU_CTRL1_OFF Bitfields',
          headers: ['Bits', 'Field Name', 'Type', 'Default', 'Description'],
          rows: [
            ['31:22', 'Reserved', 'RO', '0x0', 'Reserved, read returns 0'],
            ['21:20', 'AT', 'RW', '0x0', 'Address Translation Field for ATS: 00b=Default, 01b=Req, 10b=Trans'],
            ['19:5', 'Reserved', 'RO', '0x0', 'Reserved'],
            ['4:0', 'TYPE', 'RW', '0x0', '00000b=Memory, 00010b=Cfg0, 00011b=Cfg1, 00100b=Msg'],
          ]
        },
        sampleExplanation: `# 3.10.5.10 Outbound 寄存器位域深度精讲与驱动工程实践

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **CFG0 与 CFG1 (Configuration Type 0 / 1)**:
  - **Type 0**: 针对直接相连的下一个直连设备（如插在插槽上的显卡）；
  - **Type 1**: 针对下游桥设备（PCIe Switch / Bridge），Switch 收到 Type 1 后会根据 Bus Number 决定转发还是转换为 Type 0。
- **为什么需要 CFG_SHIFT_MODE**:
  CPU 发送配置读写时，只给出一个 32 位地址，但 PCIe 配置空间寻址需要明确指定 \`Bus:Device:Function:Register\`。通过置位 \`CFG_SHIFT_MODE\`，硬件 iATU 能自动将 CPU 地址中携带的 BDF 字段移位填入 TLP 头的对应 Byte 中，免去驱动手动拼包的巨大开销。

---

### 2. 原文逐段精讲与推导（Line-by-Line Breakdown）
- **IATU_CTRL1_OFF [4:0] TYPE 位域**:
  - \`00000b\`: 标准内存读写（DMA / MMIO 数据搬移）；
  - \`00010b\`: Type 0 配置空间读写。系统启动枚举阶段（Linux \`pci_scan_root_bus\`），驱动必须将出站窗口配置为 Type 0，才能读取到外设的 Vendor ID 和 Device ID；
  - \`00011b\`: Type 1 配置读写。用于遍历下级交换芯片之后的拓扑。
- **IATU_CTRL2_OFF [31] REGION_ENABLE**:
  - 该位是整个窗口的“总闸门”。只有在所有 Base、Limit、Target 寄存器都写入完成后，最后一步才能把这一位置 1。若先置 1 再写目标地址，可能产生瞬时不可预知的非法 TLP。

---

### 3. 工程实战与驱动场景（Real-world Use Case）
Linux 内核实现枚举远端设备时的经典代码段：

\`\`\`c
/* 扫描总线时动态切换 Type 0 与 Type 1 */
static int dw_pcie_rd_conf(struct pci_bus *bus, u32 devfn, int where, int size, u32 *val)
{
    struct dw_pcie *pci = to_dw_pcie_from_bus(bus);
    int type;

    if (pci_is_root_bus(bus))
        return pci_generic_config_read32(bus, devfn, where, size, val);

    /* 判断是直连下级 (Type 0) 还是深层级联 (Type 1) */
    type = (bus->parent == pci->pp.root_bus) ?
            PCIE_ATU_TYPE_CFG0 : PCIE_ATU_TYPE_CFG1;

    /* 将出站窗口临时切为配置模式 */
    dw_pcie_prog_outbound_atu(pci, PCIE_ATU_REGION_INDEX0,
                              type, pci->pp.cfg0_base,
                              bus->number << 24 | devfn << 16,
                              pci->pp.cfg0_size);

    *val = readl(pci->pp.va_cfg0_base + where);
    return PCIR_SUCCESS;
}
\`\`\`

---

### 4. 延伸阅读与避坑指南（Notes & Pitfalls）
- **致命坑点：LIMIT 与 SIZE 的差一错误（Off-by-One）**:
  寄存器中配置的是 \`LIMIT\`（上限地址）而不是 \`SIZE\`！
  正确写法：\`LIMIT = BASE + SIZE - 1\`；
  如果工程师粗心写成 \`LIMIT = BASE + SIZE\`，会导致该窗口多包含了一个字节，若后续窗口紧随其后，将发生窗口重叠（Window Overlap），引发难以排查的总线仲裁挂死！`
      }
    ]
  },
  {
    id: 'arm_axi4_handshake',
    name: 'ARM AXI4 Protocol Spec',
    fullName: 'AMBA® AXI and ACE Protocol Specification (ARM IHI 0022H)',
    category: 'arm',
    version: 'IHI-0022H',
    totalPages: 3,
    outline: [
      { id: 'a1', title: 'Chapter A3: Single Interface Architecture', pageNumber: 1, level: 1 },
      { id: 'a2', title: 'A3.2 Channel Handshake Dependencies', pageNumber: 2, level: 2 },
      { id: 'a3', title: 'A3.2.3 Deadlock Avoidance and Forward Progress', pageNumber: 3, level: 3 },
    ],
    pages: [
      {
        pageNum: 1,
        chapterTitle: 'Chapter A3: Architecture > A3.1 Five Independent Channels',
        sectionNumber: 'A3.1',
        pageHeading: 'AXI4 Five Independent Channels & Unidirectional Signaling',
        summary: '读地址(AR)、读数据(R)、写地址(AW)、写数据(W)、写响应(B)五条独立通道。',
        text: `A3.1 Channel Definition and Architecture

The AXI4 protocol consists of five completely independent transaction channels:
- Read Address Channel (AR)
- Read Data Channel (R)
- Write Address Channel (AW)
- Write Data Channel (W)
- Write Response Channel (B)

Each independent channel consists of a set of information signals alongside a two-wire handshake mechanism: VALID and READY. All signals on each channel are strictly unidirectional:
- In Master-to-Slave channels (AR, AW, W), data and VALID originate from Master, while READY originates from Slave.
- In Slave-to-Master channels (R, B), data/response and VALID originate from Slave, while READY originates from Master.`,
        diagramSvg: `
<svg viewBox="0 0 700 200" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <rect x="30" y="20" width="140" height="160" rx="8" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
  <text x="100" y="50" text-anchor="middle" font-weight="bold" font-size="14" fill="#1d4ed8">AXI Master</text>
  <text x="100" y="80" text-anchor="middle" font-size="11" fill="#475569">CPU Core / DMA</text>

  <rect x="530" y="20" width="140" height="160" rx="8" fill="#f8fafc" stroke="#10b981" stroke-width="2"/>
  <text x="600" y="50" text-anchor="middle" font-weight="bold" font-size="14" fill="#047857">AXI Slave</text>
  <text x="600" y="80" text-anchor="middle" font-size="11" fill="#475569">Memory / Periph</text>

  <!-- 5 Channels -->
  <g transform="translate(180, 20)">
    <rect x="0" y="10" width="340" height="22" rx="3" fill="#e0f2fe"/>
    <text x="170" y="25" text-anchor="middle" font-size="11" font-weight="600" fill="#0369a1">Read Address (ARVALID -> / <- ARREADY)</text>

    <rect x="0" y="40" width="340" height="22" rx="3" fill="#e0f2fe"/>
    <text x="170" y="55" text-anchor="middle" font-size="11" font-weight="600" fill="#0369a1">Read Data (<- RVALID / RREADY ->)</text>

    <rect x="0" y="70" width="340" height="22" rx="3" fill="#fef3c7"/>
    <text x="170" y="85" text-anchor="middle" font-size="11" font-weight="600" fill="#b45309">Write Address (AWVALID -> / <- AWREADY)</text>

    <rect x="0" y="100" width="340" height="22" rx="3" fill="#fef3c7"/>
    <text x="170" y="115" text-anchor="middle" font-size="11" font-weight="600" fill="#b45309">Write Data (WVALID -> / <- WREADY)</text>

    <rect x="0" y="130" width="340" height="22" rx="3" fill="#fef3c7"/>
    <text x="170" y="145" text-anchor="middle" font-size="11" font-weight="600" fill="#b45309">Write Response (<- BVALID / BREADY ->)</text>
  </g>
</svg>`,
        tableData: {
          title: 'Table A3-1: AXI4 Channel Directionality',
          headers: ['Channel', 'Payload Signals', 'VALID Driver', 'READY Driver'],
          rows: [
            ['AR (Read Addr)', 'ARADDR, ARLEN, ARSIZE, ARBURST', 'Master', 'Slave'],
            ['R (Read Data)', 'RDATA, RRESP, RLAST, RID', 'Slave', 'Master'],
            ['AW (Write Addr)', 'AWADDR, AWLEN, AWSIZE, AWBURST', 'Master', 'Slave'],
            ['W (Write Data)', 'WDATA, WSTRB, WLAST', 'Master', 'Slave'],
            ['B (Write Resp)', 'BRESP, BID', 'Slave', 'Master'],
          ]
        },
        sampleExplanation: `# A3.1 五独立通道架构与全双工解耦精讲

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **AXI (Advanced eXtensible Interface)**: 高性能片上系统（SoC）的主干互联总线协议。
- **与传统总线（如 AHB / APB）的本质区别**: AHB 总线是读写共享地址/数据总线，同一个时刻要么只能读，要么只能写，存在严重的总线吞吐瓶颈；而 AXI 设计了 **五条完全独立的物理单向通道**，读与写不仅完全解耦，甚至写地址和写数据都可以乱序（Out-of-Order）发送！

---

### 2. 原文逐段精讲与推导（Line-by-Line Breakdown）
- **五通道物理隔离机制**:
  - 读路径仅包含 2 条通道：AR 发送地址与 Burst 长度，R 返回数据流与错误码（RRESP）；
  - 写路径包含 3 条通道：AW 发送写地址，W 发送数据载荷，B 发送写完成确认（BRESP）。
- **单向信号流转优势**:
  所有总线信号在 RTL 层级都是严格单向的（从不出现双向三态门 inout），这使得现代纳米级 SoC 在进行后端物理综合（Synthesis）与静态时序分析（STA）时能够轻松插入 Pipeline Register，将芯片频率推升至 2GHz 以上。

---

### 3. 工程实战与驱动场景（Real-world Use Case）
在高性能 PCIe 控制器与 ARM CPU 互联时，利用 AXI4 的五通道全双工特性，芯片能在同一时钟周期内并发执行：
- CPU 正在通过 AR 通道发起从板卡读取寄存器的请求；
- 板卡 DMA 正在通过 W 通道大批量向 DDR 写入接收到的网络报文。
Linux 内核驱动感受到的就是线速的 DMA 数据吞吐率，完全不会因为 CPU 读写小寄存器而造成总线停摆。`
      },
      {
        pageNum: 2,
        chapterTitle: 'Chapter A3: Architecture > A3.2 Channel Handshake Dependencies',
        sectionNumber: 'A3.2',
        pageHeading: 'VALID and READY Dependency Rules (Preventing Deadlocks)',
        summary: '严格的握手依赖图：VALID 绝不能等待 READY，READY 可以等待 VALID。',
        text: `A3.2 Channel Handshake Dependencies

To guarantee forward progress and prevent circular deadlock in complex interconnect topologies, the AXI protocol establishes strict signal dependency rules:

Rule 1 (The Golden Law):
A transmitter is permitted to assert VALID without waiting for READY.
Once VALID is asserted, the transmitter MUST keep VALID asserted and its payload stable until the handshake occurs (when both VALID and READY are HIGH on a rising clock edge).

Rule 2:
A transmitter MUST NOT wait for READY to be asserted before it asserts VALID.
(If Master waits for READY to assert VALID, and Slave waits for VALID to assert READY, neither will ever assert, resulting in permanent dead system hang!)

Rule 3 (Permitted Receiver behavior):
A receiver (Slave for Master-to-Slave channels) MAY wait for VALID before asserting READY, OR it may assert READY ahead of time as an optimistic receiver.`,
        diagramSvg: `
<svg viewBox="0 0 700 200" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <rect x="30" y="20" width="300" height="150" rx="8" fill="#f0fdf4" stroke="#22c55e" stroke-width="2"/>
  <text x="180" y="45" text-anchor="middle" font-weight="bold" font-size="13" fill="#15803d">合法的握手行为 (Legal Flow)</text>
  <text x="180" y="70" text-anchor="middle" font-size="11" fill="#166534">Master 准备好数据 -> 拉高 VALID</text>
  <path d="M 180 80 L 180 100" stroke="#22c55e" stroke-width="2" marker-end="url(#arrow)"/>
  <text x="180" y="120" text-anchor="middle" font-size="11" fill="#166534">Slave 观察到 VALID -> 评估后拉高 READY</text>
  <text x="180" y="145" text-anchor="middle" font-size="10" font-weight="600" fill="#0f766e">两者同时为 1：握手敲定 (Handshake Done)</text>

  <rect x="370" y="20" width="300" height="150" rx="8" fill="#fff1f2" stroke="#f43f5e" stroke-width="2"/>
  <text x="520" y="45" text-anchor="middle" font-weight="bold" font-size="13" fill="#be123c">违规的死锁陷阱 (Deadlock Violation)</text>
  <text x="520" y="70" text-anchor="middle" font-size="11" fill="#9f1239">Master 在等待 Slave 拉高 READY...</text>
  <text x="520" y="100" text-anchor="middle" font-size="14" fill="#e11d48">⟳ 环形互相等待 ⟲</text>
  <text x="520" y="125" text-anchor="middle" font-size="11" fill="#9f1239">Slave 也在等待 Master 拉高 VALID...</text>
  <text x="520" y="150" text-anchor="middle" font-size="10" font-weight="bold" fill="#881337">结果：总线永久死锁挂机！</text>
</svg>`,
        tableData: {
          title: 'Table A3-2: VALID/READY Legal Dependency Matrix',
          headers: ['Channel', 'Can VALID wait for READY?', 'Can READY wait for VALID?'],
          rows: [
            ['AR Channel', 'NO (Strictly Forbidden)', 'YES (Permitted)'],
            ['R Channel', 'NO (Strictly Forbidden)', 'YES (Permitted)'],
            ['AW Channel', 'NO (Strictly Forbidden)', 'YES (Permitted)'],
            ['W Channel', 'NO (Strictly Forbidden)', 'YES (Permitted)'],
            ['B Channel', 'NO (Strictly Forbidden)', 'YES (Permitted)'],
          ]
        },
        sampleExplanation: `# A3.2 黄金法则：AXI VALID/READY 依赖关系与死锁规避

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **背压（Backpressure）机制**: Slave 处理不过来时，将 READY 置低，阻止 Master 继续灌数据。
- **握手的定义**: 只有在时钟上升沿且 \`VALID && READY == 1\` 时，数据才算被成功采样消耗。
- **设计痛点**: 芯片内几十个 IP 核（GPU、NPU、PCIe、DDR 控制器）相互连接，如果允许 Master 必须看到对方 READY 才出 VALID，而 Slave 又在等 VALID 才置 READY，就会形成**环形依赖死锁（Cyclic Dependency Deadlock）**！

---

### 2. 原文逐段精讲与推导（Line-by-Line Breakdown）
- **Rule 1（出牌方必须坚定）**:
  Master 只要自身数据就绪，必须立即拉高 VALID，并且在 Slave 没有给出 READY 之前，**绝对不允许中途撤回 VALID**，信号线上的数据也必须保持绝对稳定。如果擅自撤回，下游正在计算的流水线将读到毛刺脏数据。
- **Rule 2（禁止由等待 READY 来触发 VALID）**:
  AXI 规范明确规定：在 RTL 组合逻辑中，\`VALID\` 信号的输出严禁依赖 \`READY\` 信号的输入！
  即：\`assign VALID = (something) & READY;\` 是彻底的违法设计！

---

### 3. 工程实战与避坑（Notes & Pitfalls）
- **FPGA / ASIC 流片致命 Bug**:
  许多初级硬件工程师在手写 AXI-Stream 或 AXI-Lite 接口时，习惯性写出：
  \`always @(*) if (s_axi_ready) s_axi_valid = 1;\`
  一旦接入复杂总线交叉矩阵（Crossbar/NIC-400），系统在重载高并发测试下会偶发性整机死锁（Bus Hang），用示波器抓总线会发现时钟一直在跳，但两端都在死等，芯片直接报废！`
      },
      {
        pageNum: 3,
        chapterTitle: 'Chapter A3: Architecture > A3.2.3 Deadlock Avoidance',
        sectionNumber: 'A3.2.3',
        pageHeading: 'Cross-Channel Dependencies: Write Response & Address Ordering',
        summary: '通道间依赖约束：BVALID 必须在 WVALID && WREADY 之后，防止写丢失。',
        text: `A3.2.3 Cross-Channel Dependencies

In addition to single-channel rules, relationships between different channels must be strictly adhered to:

Write Transaction Progression:
- The Slave MUST wait for both AWVALID and AWREADY, as well as WVALID and WREADY (with WLAST=1 for bursts) before asserting BVALID.
- In other words, a Slave CANNOT return a Write Response (B channel) until the write transaction payload has actually completed transfer into the Slave's internal buffer.

Read Transaction Progression:
- The Slave MUST wait for ARVALID and ARREADY before asserting RVALID.
- The Slave CANNOT return Read Data before it has accepted the Read Address.`,
        diagramSvg: `
<svg viewBox="0 0 700 160" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <rect x="40" y="20" width="180" height="110" rx="6" fill="#f8fafc" stroke="#64748b"/>
  <text x="130" y="45" text-anchor="middle" font-weight="bold" font-size="12" fill="#334155">1. AW & W 阶段</text>
  <text x="130" y="70" text-anchor="middle" font-size="11" fill="#475569">写地址握手完成</text>
  <text x="130" y="90" text-anchor="middle" font-size="11" fill="#475569">写数据 (WLAST) 接收</text>

  <path d="M 220 75 L 320 75" stroke="#3b82f6" stroke-width="3" marker-end="url(#arrow)"/>

  <rect x="320" y="20" width="180" height="110" rx="6" fill="#eff6ff" stroke="#3b82f6"/>
  <text x="410" y="45" text-anchor="middle" font-weight="bold" font-size="12" fill="#1e40af">2. Slave 内部提交</text>
  <text x="410" y="70" text-anchor="middle" font-size="11" fill="#1e3a8a">写入 FIFO 或 DDR 缓冲</text>
  <text x="410" y="90" text-anchor="middle" font-size="11" fill="#1e3a8a">确认无总线错误 (OKAY)</text>

  <path d="M 500 75 L 560 75" stroke="#10b981" stroke-width="3"/>

  <rect x="560" y="20" width="110" height="110" rx="6" fill="#ecfdf5" stroke="#10b981"/>
  <text x="615" y="60" text-anchor="middle" font-weight="bold" font-size="12" fill="#047857">3. B 响应</text>
  <text x="615" y="85" text-anchor="middle" font-size="11" font-weight="600" fill="#065f46">BVALID=1</text>
</svg>`,
        tableData: {
          title: 'Table A3-3: Write Channel Response Causality',
          headers: ['Condition Met', 'Permitted Slave Action'],
          rows: [
            ['Only AW handshake done', 'Slave CANNOT assert BVALID'],
            ['AW done + W payload received (WLAST=1)', 'Slave is now ALLOWED to assert BVALID'],
            ['B handshake done', 'Master considers Write Transaction safely committed'],
          ]
        },
        sampleExplanation: `# A3.2.3 跨通道因果性精讲：写响应 BVALID 为什么必须滞后？

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **写完成确认（Write Response - B 通道）**:
  在弱内存序（Weakly Ordered Memory）体系中，CPU 写外设必须等待写响应返回，才能确认数据已经落地。
- **如果允许提前返回 BVALID 会怎样？**:
  如果 Slave 刚收到地址就心虚地提前拉高 BVALID，CPU 收到后以为数据已经进去了，便立即发起下一次中断解绑，但实际上数据还在半路上的总线 FIFO 中没落地，极易发生“先响应后出错”的重大事故。

---

### 2. 工程实战（Linux 内核内存屏障 mb() 与 io_read）
在 ARM Linux 内核驱动中，读写外设寄存器通常使用 \`writel()\`：

\`\`\`c
/* ARM64 writel 内部实现与 AXI 行为对应 */
static inline void __raw_writel(u32 val, volatile void __iomem *addr)
{
    asm volatile("str %w0, [%1]" : : "rZ" (val), "r" (addr));
}

#define writel(v,c) ({ \\
    __iowmb(); /* 保证此前的内存写入均已通过 W 通道下发 */ \\
    __raw_writel((__force u32)cpu_to_le32(v), c); \\
})
\`\`\`

当驱动随后需要等待外设硬件状态就绪时，必须紧跟一个 \`readl()\`，强迫 AXI 总线完成此前的写提交，这在硬件工程界被称为 **"PCIe/AXI 写冲刷（Write Flush）"** 技术！`
      }
    ]
  },
  {
    id: 'cxl_2_0_hdm',
    name: 'CXL 2.0 Spec',
    fullName: 'Compute Express Link™ 2.0 Specification',
    category: 'cxl',
    version: '2.0-r1.0',
    totalPages: 2,
    outline: [
      { id: 'x1', title: 'Chapter 8: CXL.mem Architecture', pageNumber: 1, level: 1 },
      { id: 'x2', title: '8.2.5 Host-managed Device Memory (HDM) Decoders', pageNumber: 2, level: 2 },
    ],
    pages: [
      {
        pageNum: 1,
        chapterTitle: 'Chapter 8: CXL.mem Protocol Architecture > 8.1 Overview',
        sectionNumber: '8.1',
        pageHeading: 'CXL 2.0 Memory Protocol & Host/Device Interleaving',
        summary: 'CXL.io、CXL.cache 与 CXL.mem 三大子协议协同与近存扩展。',
        text: `8.1 CXL.mem Protocol Overview

Compute Express Link (CXL) is an open industry standard providing high-bandwidth, low-latency connectivity between host processors and devices such as accelerators and memory expanders.

CXL multiplexes three sub-protocols across a common PCIe physical layer:
- CXL.io: Standard PCIe transaction framing for device discovery, configuration, and virtualization.
- CXL.cache: Permits devices to snoop and access host processor memory with low latency.
- CXL.mem: Permits host processors to access device-attached memory (Host-managed Device Memory, HDM) as standard system DDR.

HDM allows byte-addressable memory pooling across multi-socket servers with cache-coherent load/store instructions.`,
        diagramSvg: `
<svg viewBox="0 0 700 160" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <rect x="30" y="20" width="160" height="120" rx="8" fill="#eff6ff" stroke="#2563eb" stroke-width="2"/>
  <text x="110" y="50" text-anchor="middle" font-weight="bold" font-size="13" fill="#1d4ed8">Host CPU</text>
  <text x="110" y="75" text-anchor="middle" font-size="11" fill="#475569">Local NUMA Node 0</text>
  <text x="110" y="95" text-anchor="middle" font-size="11" font-family="monospace" fill="#0f172a">DDR5 Direct Channel</text>

  <path d="M 190 80 L 290 80" stroke="#2563eb" stroke-width="3" marker-end="url(#arrow)"/>

  <rect x="290" y="20" width="140" height="120" rx="8" fill="#fdf4ff" stroke="#c026d3" stroke-width="2"/>
  <text x="360" y="50" text-anchor="middle" font-weight="bold" font-size="13" fill="#86198f">CXL 2.0 Switch</text>
  <text x="360" y="75" text-anchor="middle" font-size="10" fill="#701a75">CXL.mem Traffic</text>
  <text x="360" y="95" text-anchor="middle" font-size="10" fill="#a21caf">Sub-100ns Latency</text>

  <path d="M 430 80 L 510 80" stroke="#c026d3" stroke-width="3"/>

  <rect x="510" y="20" width="160" height="120" rx="8" fill="#ecfdf5" stroke="#059669" stroke-width="2"/>
  <text x="590" y="50" text-anchor="middle" font-weight="bold" font-size="13" fill="#065f46">Type 3 Memory Exp</text>
  <text x="590" y="75" text-anchor="middle" font-size="11" fill="#047857">HDM Memory Pool</text>
  <text x="590" y="95" text-anchor="middle" font-size="11" font-family="monospace" fill="#064e3b">CXL Attached 512GB</text>
</svg>`,
        tableData: {
          title: 'Table 8-1: CXL Protocols Breakdown',
          headers: ['Protocol', 'Target Domain', 'Master Device', 'Coherency Scope'],
          rows: [
            ['CXL.io', 'Enumeration, MMIO, DMA', 'Host / Device', 'Non-coherent standard PCIe'],
            ['CXL.cache', 'Direct Host Cache Snoop', 'Device Accelerator', 'Host CPU Coherent Hierarchy'],
            ['CXL.mem', 'Direct RAM load/store', 'Host CPU', 'Host NUMA Address Domain'],
          ]
        },
        sampleExplanation: `# 8.1 CXL.mem 架构与内存池化技术精解

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **HDM (Host-managed Device Memory)**: 由操作系统/CPU 统一纳管的外置设备内存，完全当作标准物理内存（NUMA Node）使用。
- **与普通 PCIe DMA 的本质区别**: 普通 PCIe 必须通过 DMA 拷贝或 MMIO 低速读写；而 CXL.mem 允许 CPU 核心直接用 \`movq (%rax), %rbx\` 指令执行单字节缓存级读写，硬件自动处理 64 字节 Cacheline 搬移，延迟低于 100ns！

---

### 2. 核心机制拆解
CXL 2.0 规范引入了动态内存池化（Memory Pooling）。一台机架上的 8 台服务器可以通过 CXL Switch 共享由多张 Type 3 内存扩展卡组成的数 TB 内存池。当某台云虚机需要扩容时，直接动态挂载一段 CXL HDM 内存范围，无需重启机器。`
      },
      {
        pageNum: 2,
        chapterTitle: 'Chapter 8: CXL.mem > 8.2.5 HDM Decoders',
        sectionNumber: '8.2.5',
        pageHeading: 'HDM Decoder Registers & Granularity Interleaving',
        summary: 'HDM 解码器基址、容量、Target List 与 256B/4KB 交叉粒度。',
        text: `8.2.5 Host-managed Device Memory (HDM) Decoder Registers

A CXL Type 3 device or Root Port switch incorporates one or more HDM Decoders. Each decoder maps a continuous range of Host Physical Addresses (HPA) to Device Physical Addresses (DPA).

Registers per Decoder:
1. HDM Decoder Base Low/High (Offset 0x10, 0x14):
Specifies the 64-bit base Host Physical Address for the mapped region. Must be aligned to the region size.

2. HDM Decoder Size Low/High (Offset 0x18, 0x1C):
Specifies the region capacity in multiples of 256MB.

3. HDM Decoder Control (Offset 0x20):
- Bit [0]: Commit (RW). Setting 1 commits the configuration.
- Bit [1]: Committed (RO). Hardware confirms translation pipeline active.
- Bit [7:4]: Interleave Ways (IW). 0=1-way, 1=2-way, 2=4-way, 3=8-way, 4=16-way.
- Bit [11:8]: Interleave Granularity (IG). 0=256B, 1=512B, 2=1KB, 3=2KB, 4=4KB.

4. HDM Decoder Target List (Offset 0x24):
Contains Target Port IDs across interleaved channels.`,
        diagramSvg: `
<svg viewBox="0 0 700 160" class="w-full h-auto text-slate-700 dark:text-slate-200">
  <text x="350" y="25" text-anchor="middle" font-weight="bold" font-size="13" fill="#0f172a">HDM Decoder Control Register (Bitfields)</text>
  <g transform="translate(60, 45)">
    <rect x="0" y="0" width="240" height="40" fill="#f1f5f9" stroke="#cbd5e1"/>
    <text x="120" y="25" text-anchor="middle" font-size="11" fill="#64748b">[31:12] Reserved</text>

    <rect x="240" y="0" width="110" height="40" fill="#fef3c7" stroke="#f59e0b"/>
    <text x="295" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309">[11:8] IG (Granularity)</text>

    <rect x="350" y="0" width="110" height="40" fill="#dbeafe" stroke="#3b82f6"/>
    <text x="405" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#1d4ed8">[7:4] IW (Ways)</text>

    <rect x="460" y="0" width="60" height="40" fill="#d1fae5" stroke="#10b981"/>
    <text x="490" y="25" text-anchor="middle" font-size="10" font-weight="bold" fill="#065f46">[1] Done</text>

    <rect x="520" y="0" width="60" height="40" fill="#fee2e2" stroke="#ef4444"/>
    <text x="550" y="25" text-anchor="middle" font-size="10" font-weight="bold" fill="#b91c1c">[0] Commit</text>
  </g>
</svg>`,
        tableData: {
          title: 'Table 8-2: HDM Decoder Interleave Settings',
          headers: ['Field', 'Bits', 'Settings', 'Engineering Significance'],
          rows: [
            ['IG', '[11:8]', '0=256B, 1=512B, 4=4KB', 'Striping block size across controllers'],
            ['IW', '[7:4]', '0=1-way, 1=2-way, 2=4-way', 'Parallel channels for DDR bandwidth aggregation'],
            ['Commit', '[0]', 'Write 1 to latch', 'Hardware commits route pipeline'],
            ['Committed', '[1]', 'Poll for 1', 'Driver must check before adding to page tables'],
          ]
        },
        sampleExplanation: `# 8.2.5 HDM 解码器与交织（Interleave）配置工程实战

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- **为什么需要交织（Interleave）？**: 单根 CXL 接口带宽可能只有 PCIe x16 (64GB/s)，而现代 CPU 内存控制器带宽高达数百 GB/s。通过将数据按 256 字节分片交织在 4 个或 8 个 CXL 扩展设备上，访问连续内存时带宽直接线性翻 4~8 倍！
- **Commit 机制的原子性**: 修改内存路由绝对不能“边改边走”，写入 \`Commit=1\` 会让硬件在静默期原子性刷新内部 CAM/TCAM 表项，确保 CPU 不会遭遇路由空洞。

---

### 2. Linux 内核 drivers/cxl 实战
在 Linux 内核 \`drivers/cxl/core/region.c\` 中，CXL 子系统会读取并编程解码器：

\`\`\`c
/* Linux drivers/cxl/core/region.c 编程 HDM 解码器 */
static int cxl_decoder_commit(struct cxl_decoder *cxld)
{
    u32 ctrl;

    ctrl = FIELD_PREP(CXL_HDM_DECODER_CTRL_IG, cxld->interleave_granularity) |
           FIELD_PREP(CXL_HDM_DECODER_CTRL_IW, cxld->interleave_ways) |
           CXL_HDM_DECODER_CTRL_COMMIT;

    writel(ctrl, cxld->regs + CXL_HDM_DECODER_CTRL_OFFSET);

    /* 等待硬件锁相完成 */
    return readl_poll_timeout(cxld->regs + CXL_HDM_DECODER_CTRL_OFFSET,
                              ctrl, ctrl & CXL_HDM_DECODER_CTRL_COMMITTED,
                              10, 1000);
}
\`\`\`

---

### 3. 避坑指南（Notes & Pitfalls）
- **RAS 毒化缓存行（Poisoned Cacheline）**: CXL 设备若发生物理 DRAM 翻转且 ECC 无法纠正，设备会向 Host 返回带有 \`Poison\` 标识的 64 字节报文。驱动必须注册 MCE（Machine Check Exception）处理函数，否则 CPU 尝试执行该指令时会导致整机 Kernel Panic 宕机。`
      }
    ]
  }
];
